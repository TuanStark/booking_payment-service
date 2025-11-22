import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, PaymentMethod } from './dto/enum';
import { VietqrProvider } from './provider/vietqr.provider';
import { PaymentVNPayProvider } from './provider/vnpay.provider';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RabbitMQProducerService } from 'src/messaging/rabbitmq/rabbitmq.producer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { ExternalService } from 'src/common/external/external.service';
import { generateBookingCode } from 'src/utils/generate-code';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vietqr: VietqrProvider,
    private readonly vnpay: PaymentVNPayProvider,
    private readonly rabbitmq: RabbitMQProducerService,
    private readonly externalService: ExternalService,
    private readonly configService: ConfigService,
  ) {}

  private normalizeMethod(method: PaymentMethod | string): PaymentMethod {
    const normalized = String(method).toUpperCase();
    if (
      normalized !== PaymentMethod.VIETQR &&
      normalized !== PaymentMethod.VNPAY
    ) {
      throw new BadRequestException('Unsupported provider');
    }
    return normalized as PaymentMethod;
  }

  // create payment and return record + qr url
  // payments.service.ts → thay nguyên hàm createPayment bằng cái này

  async createPayment(userId: string, dto: CreatePaymentDto) {
    // Validate required fields
    if (!dto.bookingId || !dto.amount || !dto.method) {
      throw new BadRequestException(
        'Missing required fields: bookingId, amount, method',
      );
    }

    // Chuẩn hóa method
    const method = this.normalizeMethod(dto.method);

    let qrImageUrl: string | undefined;
    let paymentUrl: string | undefined;
    let reference: string | undefined;

    // Tạo mã giao dịch duy nhất cho VNPay (bắt buộc phải unique toàn hệ thống)
    const generateVnpayTxnRef = () => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      return `BK${dto.bookingId}_${timestamp}_${random}`.substring(0, 100); // max 100 ký tự
    };

    this.logger.log(
      `[createPayment] user=${userId} booking=${dto.bookingId} method=${method} amount=${dto.amount}`,
    );

    if (method === PaymentMethod.VIETQR) {
      // === VIETQR (giữ nguyên như cũ) ===
      const transactionId = generateBookingCode({});
      const vietqrResult = await this.vietqr.createPayment({
        amount: dto.amount,
        bookingId: dto.bookingId,
      });
      qrImageUrl = vietqrResult.data.qrCode || undefined;
      paymentUrl = vietqrResult.data.checkoutUrl || undefined;
      reference = vietqrResult.data.orderCode.toString() || undefined;
    } else if (method === PaymentMethod.VNPAY) {
      // === VNPAY ===
      // Lấy return URL từ env hoặc tự động tạo từ base URL
      let returnUrl = this.configService.get<string>('VNPAY_RETURN_URL');
      
      if (!returnUrl) {
        // Tự động tạo từ PAYMENT_SERVICE_URL hoặc BASE_URL
        const baseUrl = 
          this.configService.get<string>('PAYMENT_SERVICE_URL') ||
          this.configService.get<string>('BASE_URL') ||
          this.configService.get<string>('API_URL');
        
        if (baseUrl) {
          returnUrl = `${baseUrl.replace(/\/$/, '')}/payments/vnpay/return`;
        } else {
          throw new BadRequestException(
            'VNPAY_RETURN_URL hoặc PAYMENT_SERVICE_URL/BASE_URL chưa được cấu hình trong .env. ' +
            'Vui lòng cấu hình VNPAY_RETURN_URL với URL đầy đủ (ví dụ: https://yourdomain.com/payments/vnpay/return) ' +
            'và đăng ký URL này trong VNPay dashboard.',
          );
        }
      }

      const ipAddr = (dto as any).ipAddr || '127.0.0.1';

      // Tạo mã giao dịch VNPay DUY NHẤT (rất quan trọng!)
      const vnpTxnRef = generateVnpayTxnRef();

      this.logger.debug(
        `[createPayment] VNPay config resolved returnUrl=${returnUrl}`,
      );

      const vnpayResult = await this.vnpay.createVNPayPayment({
        orderId: vnpTxnRef, // ← Không dùng bookingId trực tiếp
        amount: dto.amount,
        orderInfo: `Thanh toan booking ${dto.bookingId}`,
        returnUrl, // ← Lấy từ .env, đảm bảo đúng
        ipAddr,
        locale: 'vn',
      });

      paymentUrl = vnpayResult.vnpUrl;
      reference = vnpTxnRef; // ← Lưu lại để IPN và return URL tìm đúng payment
    }

    // Tạo bản ghi payment trong DB
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        bookingId: dto.bookingId,
        amount: dto.amount,
        method,
        qrImageUrl,
        paymentUrl,
        reference, // ← Với VNPay là vnp_TxnRef, với VietQR là reference
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Payment created: ${payment.id} | Method: ${method} | Ref: ${reference}`,
    );

    return payment;
  }

  // update status and publish rabbitmq
  async updateStatusByPaymentId(
    paymentId: string,
    status: PaymentStatus,
    transactionId?: string,
  ) {
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        transactionId: transactionId ?? undefined,
        paymentDate: status === PaymentStatus.SUCCESS ? new Date() : undefined,
      },
    });

    const topic =
      status === PaymentStatus.SUCCESS ? 'payment.success' : 'payment.failed';
    await this.rabbitmq.emitPaymentEvent(topic, {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transactionId || undefined,
      reference: payment.reference || undefined,
    });

    this.logger.log(`Payment ${paymentId} => ${status}, published ${topic}`);
    return payment;
  }

  async verifyPaymentFromEmail(data: {
    bookingId: string;
    amount: number;
    rawMessage: string;
  }) {
    const { bookingId, amount } = data;

    const payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: 'PENDING' },
    });

    if (!payment) {
      this.logger.warn(`No pending payment found for booking ${bookingId}`);
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        paymentDate: new Date(),
      },
    });

    await this.rabbitmq.emitPaymentEvent('payment.status.updated', {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amount,
      status: 'SUCCESS',
      reference: payment.reference || undefined,
    });

    this.logger.log(
      `✅ Payment verified for booking ${bookingId}, event pushed.`,
    );
  }

  async getPayment(paymentId: string) {
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  async findAll(query: FindAllDto, token?: string) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (pageNumber < 1 || limitNumber < 1) {
      throw new Error('Page and limit must be greater than 0');
    }

    const take = limitNumber;
    const skip = (pageNumber - 1) * take;

    const searchUpCase = search.charAt(0).toUpperCase() + search.slice(1);
    const where = search
      ? {
          OR: [
            { userId: { contains: searchUpCase } },
            { bookingId: { contains: searchUpCase } },
            { reference: { contains: searchUpCase } },
            { transactionId: { contains: searchUpCase } },
          ],
        }
      : {};
    const orderBy = { [sortBy]: sortOrder };

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Enrich payments với user data
    const enrichedPayments = await this.enrichPaymentsWithUserData(
      payments,
      token,
    );

    return {
      data: enrichedPayments,
      meta: {
        total,
        pageNumber,
        limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  /**
   * Enrich payments với user data từ external service
   */
  private async enrichPaymentsWithUserData(
    payments: any[],
    token?: string,
  ): Promise<any[]> {
    if (payments.length === 0) {
      return payments;
    }

    // Collect tất cả userId
    const userIds: string[] = [];
    payments.forEach((payment) => {
      if (payment.userId && !userIds.includes(payment.userId)) {
        userIds.push(payment.userId);
      }
    });

    // Fetch users parallel (tối ưu performance)
    const usersMap = await this.externalService.getUsersByIds(userIds, token);

    // Map user data vào payments
    return payments.map((payment) => ({
      ...payment,
      user: usersMap.get(payment.userId) || null,
    }));
  }

  // Giữ lại method cũ để backward compatibility
  async listPayments() {
    return this.prisma.payment.findMany();
  }

  // add in PaymentsService
  async findPaymentByReference(reference: string) {
    return this.prisma.payment.findFirst({ where: { reference } });
  }

  /**
   * Tìm các payment đã hoàn thành (SUCCESS) trong khoảng thời gian
   * Filter theo createdAt (thời điểm tạo payment)
   */
  async findCompletedPayments(filters: {
    startDate: Date;
    endDate: Date;
    method?: string;
  }) {
    const { startDate, endDate, method } = filters;

    const where: any = {
      status: PaymentStatus.SUCCESS,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (method) {
      where.method = method.toUpperCase();
    }

    return this.prisma.payment.findMany({
      where,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Lấy doanh thu theo tháng
   * Chỉ tính payments có status = SUCCESS
   */
  async getMonthlyRevenue(filters: {
    year?: number;
    startDate?: string;
    endDate?: string;
    method?: string;
  }) {
    const { year, startDate, endDate, method } = filters;

    const currentYear = year ? Number(year) : new Date().getFullYear();

    // Validate year
    if (isNaN(currentYear) || currentYear < 2000 || currentYear > 2100) {
      throw new Error('Invalid year');
    }

    // Nếu có startDate/endDate thì dùng, không thì lấy cả năm
    const start = startDate
      ? new Date(startDate)
      : new Date(currentYear, 0, 1, 0, 0, 0, 0); // Đầu năm

    const end = endDate
      ? new Date(endDate)
      : new Date(currentYear, 11, 31, 23, 59, 59, 999); // Cuối năm

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format');
    }

    if (start > end) {
      throw new Error('startDate must be before endDate');
    }

    // Query payments từ database
    const payments = await this.findCompletedPayments({
      startDate: start,
      endDate: end,
      method: method,
    });

    // Group by month
    const monthlyData = new Map<string, number>();
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    payments.forEach((payment) => {
      // Group by month theo createdAt
      const paymentDate = new Date(payment.createdAt);
      const monthIndex = paymentDate.getMonth();
      const monthKey = monthNames[monthIndex];

      const currentAmount = monthlyData.get(monthKey) || 0;
      monthlyData.set(monthKey, currentAmount + payment.amount);
    });

    // Format response
    // Nếu có startDate/endDate riêng lẻ (không phải cả năm) thì chỉ hiển thị tháng có data
    // Nếu là cả năm (không có startDate/endDate) thì hiển thị cả 12 tháng
    const isFullYear = !startDate && !endDate;

    let result: Array<{ month: string; amount: number }>;

    if (isFullYear) {
      // Hiển thị cả 12 tháng (kể cả tháng = 0)
      result = monthNames.map((month) => ({
        month,
        amount: monthlyData.get(month) || 0,
      }));
    } else {
      // Chỉ hiển thị các tháng có data
      result = monthNames
        .map((month, index) => ({
          month,
          monthIndex: index,
          amount: monthlyData.get(month) || 0,
        }))
        .filter((item) => {
          // Lọc các tháng nằm trong range start-end
          const monthStart = new Date(currentYear, item.monthIndex, 1);
          const monthEnd = new Date(
            currentYear,
            item.monthIndex + 1,
            0,
            23,
            59,
            59,
            999,
          );
          return (
            (monthStart >= start && monthStart <= end) ||
            (monthEnd >= start && monthEnd <= end) ||
            (monthStart <= start && monthEnd >= end)
          );
        })
        .map(({ month, amount }) => ({ month, amount }));
    }

    const totalRevenue = result.reduce((sum, item) => sum + item.amount, 0);
    const totalMonths = result.filter((item) => item.amount > 0).length;

    return {
      success: true,
      data: result,
      meta: {
        year: currentYear,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalRevenue,
        totalMonths,
        totalPayments: payments.length,
      },
    };
  }

  // Trong file payments.service.ts – dán vào cuối class

  async handleVnpayReturn(query: Record<string, any>) {
    this.logger.debug(
      `[handleVnpayReturn] Received query: ${JSON.stringify(query)}`,
    );

    const isValid = this.vnpay.verifyVNPaySignature(query);
    if (!isValid) {
      this.logger.warn(
        `[handleVnpayReturn] Invalid signature for txn=${query.vnp_TxnRef}`,
      );
      throw new BadRequestException('Chữ ký không hợp lệ');
    }

    const txnRef = query.vnp_TxnRef as string;
    const responseCode = query.vnp_ResponseCode as string;

    const payment = await this.prisma.payment.findFirst({
      where: { reference: txnRef, method: 'VNPAY' },
    });

    if (!payment) {
      this.logger.warn(
        `[handleVnpayReturn] Payment not found for reference=${txnRef}`,
      );
      throw new BadRequestException('Không tìm thấy giao dịch');
    }

    if (responseCode === '00') {
      this.logger.log(
        `[handleVnpayReturn] Payment success txn=${txnRef} booking=${payment.bookingId}`,
      );
      await this.updateStatusByPaymentId(
        payment.id,
        PaymentStatus.SUCCESS,
        query.vnp_TransactionNo,
      );
      return { success: true, payment };
    } else {
      this.logger.warn(
        `[handleVnpayReturn] Payment failed txn=${txnRef} code=${responseCode}`,
      );
      await this.updateStatusByPaymentId(payment.id, PaymentStatus.FAILED);
      return { success: false, code: responseCode };
    }
  }

  async handleVnpayIpn(query: Record<string, any>) {
    this.logger.log(`VNPay IPN received: ${JSON.stringify(query)}`);

    const isValid = this.vnpay.verifyVNPaySignature(query);
    if (!isValid) {
      this.logger.warn(
        `[handleVnpayIpn] Invalid signature for txn=${query.vnp_TxnRef}`,
      );
      return { RspCode: '97', Message: 'Fail checksum' };
    }

    const txnRef = query.vnp_TxnRef as string;
    const amount = Number(query.vnp_Amount) / 100;
    const responseCode = query.vnp_ResponseCode as string;

    const payment = await this.prisma.payment.findFirst({
      where: { reference: txnRef, method: 'VNPAY' },
    });

    if (!payment) {
      this.logger.warn(
        `[handleVnpayIpn] Payment not found for reference=${txnRef}`,
      );
      return { RspCode: '02', Message: 'Order not found' };
    }

    // Kiểm tra số tiền có đúng không
    if (amount !== payment.amount) {
      this.logger.warn(
        `[handleVnpayIpn] Amount mismatch txn=${txnRef} expected=${payment.amount} received=${amount}`,
      );
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    // Tránh xử lý 2 lần
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.debug(
        `[handleVnpayIpn] Payment already success txn=${txnRef}`,
      );
      return { RspCode: '00', Message: 'Confirm success' };
    }

    if (responseCode === '00') {
      this.logger.log(
        `[handleVnpayIpn] Payment success txn=${txnRef} booking=${payment.bookingId}`,
      );
      await this.updateStatusByPaymentId(
        payment.id,
        PaymentStatus.SUCCESS,
        query.vnp_TransactionNo,
      );
      return { RspCode: '00', Message: 'Confirm success' };
    } else {
      this.logger.warn(
        `[handleVnpayIpn] Payment failed txn=${txnRef} code=${responseCode}`,
      );
      await this.updateStatusByPaymentId(payment.id, PaymentStatus.FAILED);
      return { RspCode: '99', Message: 'Payment failed' };
    }
  }
}
