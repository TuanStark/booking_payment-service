import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, PaymentMethod } from './dto/enum';
import { VietqrProvider } from './provider/vietqr.provider';
import { PaymentVNPayProvider } from './provider/vnpay.provider';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  PayosWebhookData,
  PayosWebhookType,
} from './dto/payos/payos-webhook-body.payload';
import { Webhook as PayosSdkWebhook, WebhookData as PayosSdkWebhookData } from '@payos/node';
import { RabbitMQProducerService } from 'src/messaging/rabbitmq/rabbitmq.producer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { ExternalService } from 'src/common/external/external.service';
import { generateBookingCode } from 'src/utils/generate-code';
import { PaymentMomoProvider } from './provider/momo.provider';
import { PayosProvider } from './provider/payos.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vietqr: VietqrProvider,
    private readonly vnpay: PaymentVNPayProvider,
    private readonly rabbitmq: RabbitMQProducerService,
    private readonly externalService: ExternalService,
    private readonly momo: PaymentMomoProvider,
    private readonly payos: PayosProvider,
    private readonly configService: ConfigService,
  ) { }

  private normalizeMethod(method: PaymentMethod | string): PaymentMethod {
    const normalized = String(method).toUpperCase();
    if (
      normalized !== PaymentMethod.VIETQR &&
      normalized !== PaymentMethod.VNPAY &&
      normalized !== PaymentMethod.MOMO &&
      normalized !== PaymentMethod.PAYOS
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
    let orderCode: bigint | undefined;

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
      const ipAddr = (dto as any).ipAddr || '127.0.0.1';
      const vnpTxnRef = generateVnpayTxnRef();

      const vnpayResult = await this.vnpay.createVNPayPayment({
        orderId: vnpTxnRef,
        amount: dto.amount,
        orderInfo: `Thanh toan booking ${dto.bookingId}`,
        ipAddr,
        locale: 'vn',
      });

      paymentUrl = vnpayResult.vnpUrl;
      reference = vnpTxnRef;
    } else if (method === PaymentMethod.MOMO) {
      const momoResult = await this.momo.createMoMoPayment({
        amount: dto.amount,
        orderId: `BK_${dto.bookingId}_${Date.now()}`, // Simple unique orderId
        orderInfo: `Thanh toan booking ${dto.bookingId}`,
        redirectUrl: this.configService.get('MOMO_REDIRECT_URL') || 'http://localhost:4000/payments/momo/return',
        ipnUrl: this.configService.get('MOMO_IPN_URL') || 'http://localhost:4000/payments/momo/ipn',
      });
      console.log("momoResult", momoResult);
      paymentUrl = momoResult.payUrl || undefined;
      reference = momoResult.orderId.toString() || undefined;
    } else if (method === PaymentMethod.PAYOS) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 100);
      orderCode = BigInt(`${timestamp}${random}`);

      const payosResult = await this.payos.createPaymentLink({
        orderCode: Number(orderCode),
        amount: dto.amount,
        description: `Booking ${dto.bookingId}`,
        cancelUrl: this.configService.get<string>('FRONTEND_URL') + '/payment/cancel' || 'http://localhost:5173/payment/cancel',
        returnUrl: this.configService.get<string>('FRONTEND_URL') + '/payment/success' || 'http://localhost:5173/payment/success',
      });

      paymentUrl = payosResult.checkoutUrl;
      reference = payosResult.orderCode.toString();
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
        reference, // ← Với VNPay là vnp_TxnRef, với VietQR/PayOS là reference/orderCode
        transactionId: reference,
        orderCode: orderCode, // Save BigInt orderCode
        paymentDate: new Date(),
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Payment created: ${payment.id} | Method: ${method} | Ref: ${reference}`,
    );

    return payment;
  }

  // Handle PayOS Webhook
  async handlePayosWebhook(body: PayosSdkWebhook) {
    this.logger.log(`[handlePayosWebhook] Received webhook`);

    let data: PayosSdkWebhookData;
    try {
      data = await this.payos.verifyWebhookData(body);
    } catch (error) {
      this.logger.error(`[handlePayosWebhook] Verification failed: ${error.message}`);
      return { success: false, message: error.message };
    }

    const { orderCode, amount, code, desc, reference } = data;
    const refString = orderCode.toString();

    // Find payment by orderCode (stored in reference or orderCode field)
    // Since we save orderCode in `reference` for PayOS, we can search by that.
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { reference: refString },
          { orderCode: BigInt(orderCode) }
        ],
        method: PaymentMethod.PAYOS
      },
    });

    if (!payment) {
      this.logger.warn(`[handlePayosWebhook] Payment not found for orderCode=${orderCode}`);
      return { success: false, message: 'Payment not found' };
    }

    // Check amount
    if (payment.amount !== amount) {
      this.logger.warn(
        `[handlePayosWebhook] Amount mismatch orderCode=${orderCode} expected=${payment.amount} received=${amount}`,
      );
      return { success: false, message: 'Amount mismatch' };
    }

    if (code === '00') {
      this.logger.log(`[handlePayosWebhook] Payment success orderCode=${orderCode}`);
      await this.updateStatusByPaymentId(
        payment.id,
        PaymentStatus.SUCCESS,
        reference || undefined, // PayOS reference (transaction ID from bank)
      );
    } else {
      this.logger.warn(`[handlePayosWebhook] Payment failed orderCode=${orderCode} code=${code}`);
      await this.updateStatusByPaymentId(payment.id, PaymentStatus.FAILED);
    }

    return { success: true };
  }

  /**
   * Handle MoMo Return URL (Redirect)
   */
  async handleMomoReturn(query: any) {
    this.logger.log(`[handleMomoReturn] Query: ${JSON.stringify(query)}`);
    const { orderId, resultCode, message } = query;

    // Verify signature if needed (Momo usually returns signature in redirect, but strictly ipn is safer)
    // For redirect, we just update UI status, but double check with DB

    const payment = await this.prisma.payment.findFirst({
      where: { reference: orderId, method: PaymentMethod.MOMO },
    });

    if (!payment) {
      return {
        success: false,
        message: 'Payment not found',
      };
    }

    let status = PaymentStatus.PENDING;
    if (resultCode === '0') {
      status = PaymentStatus.SUCCESS;
    } else {
      status = PaymentStatus.FAILED;
    }

    // Only update if not already success (IPN might have come first)
    if (payment.status !== PaymentStatus.SUCCESS) {
      await this.updateStatusByPaymentId(payment.id, status);
    }

    return {
      success: resultCode === '0',
      message,
      paymentId: payment.id,
      bookingId: payment.bookingId,
    };
  }

  /**
   * Handle MoMo IPN
   */
  async handleMomoIpn(body: any) {
    this.logger.log(`[handleMomoIpn] Body: ${JSON.stringify(body)}`);

    // Verify signature
    const isValid = this.momo.verifyMoMoSignature(body);
    if (!isValid) {
      this.logger.error('[handleMomoIpn] Invalid signature');
      return { status: 400, message: 'Invalid signature' }; // Momo expects simple response or 204
    }

    const { orderId, resultCode, amount, transId } = body;

    const payment = await this.prisma.payment.findFirst({
      where: { reference: orderId, method: PaymentMethod.MOMO },
    });

    if (!payment) {
      this.logger.warn(`[handleMomoIpn] Payment not found ref=${orderId}`);
      return { status: 404, message: 'Payment not found' };
    }

    if (payment.amount !== amount) {
      this.logger.warn(`[handleMomoIpn] Amount mismatch`);
      // Continue or fail?
    }

    if (resultCode === 0) {
      await this.updateStatusByPaymentId(payment.id, PaymentStatus.SUCCESS, transId.toString());
    } else {
      await this.updateStatusByPaymentId(payment.id, PaymentStatus.FAILED, transId.toString());
    }

    return { status: 204 }; // Momo expects 204 No Content for success
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

  async handleVietqrWebhook(body: PayosWebhookType) {
    console.log(body);
    this.logger.log(`[handleVietqrWebhook] Received webhook: ${JSON.stringify(body)}`);

    let data: PayosWebhookData;
    try {
      data = this.vietqr.verifyWebhook(body);
    } catch (error) {
      this.logger.error(`[handleVietqrWebhook] Verification failed: ${error.message}`);
      return { success: false, message: error.message };
    }

    const { orderCode, amount, code, desc } = data;
    const reference = orderCode.toString();

    const payment = await this.prisma.payment.findFirst({
      where: { reference, method: PaymentMethod.VIETQR },
    });

    if (!payment) {
      this.logger.warn(`[handleVietqrWebhook] Payment not found for ref=${reference}`);
      return { success: false, message: 'Payment not found' };
    }

    // Check amount
    if (payment.amount !== amount) {
      this.logger.warn(
        `[handleVietqrWebhook] Amount mismatch ref=${reference} expected=${payment.amount} received=${amount}`,
      );
      return { success: false, message: 'Amount mismatch' };
    }

    // Check status
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(`[handleVietqrWebhook] Payment already success ref=${reference}`);
      return { success: true, message: 'Already success' };
    }

    if (code === '00') {
      this.logger.log(`[handleVietqrWebhook] Payment success ref=${reference}`);
      await this.updateStatusByPaymentId(
        payment.id,
        PaymentStatus.SUCCESS,
        data.paymentLinkId || undefined,
      );
      const topic = 'payment.success';
      await this.rabbitmq.emitPaymentEvent(topic, {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        amount: payment.amount,
        status: payment.status,
        transactionId: payment.transactionId || undefined,
        reference: payment.reference || undefined,
      });

      this.logger.log(`Payment ${payment.id} => ${payment.status}, published ${topic}`);
    } else {
      this.logger.warn(`[handleVietqrWebhook] Payment failed ref=${reference} code=${code} desc=${desc}`);
      await this.updateStatusByPaymentId(payment.id, PaymentStatus.FAILED);
      const topic = 'payment.failed';
      await this.rabbitmq.emitPaymentEvent(topic, {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        amount: payment.amount,
        status: payment.status,
        transactionId: payment.transactionId || undefined,
        reference: payment.reference || undefined,
      });

      this.logger.log(`Payment ${payment.id} => ${payment.status}, published ${topic}`);
    }

    return { success: true };
  }

  /**
   * Get payment statistics for dashboard
   */
  async getStats(year?: number) {
    const currentYear = year || new Date().getFullYear();

    const [total, pending, success, failed, totalRevenueResult] =
      await Promise.all([
        this.prisma.payment.count(),
        this.prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
        this.prisma.payment.count({ where: { status: PaymentStatus.SUCCESS } }),
        this.prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
        this.prisma.payment.aggregate({
          where: { status: PaymentStatus.SUCCESS },
          _sum: { amount: true },
        }),
      ]);

    const totalRevenue = totalRevenueResult._sum.amount || 0;

    // Get monthly revenue using existing method
    const monthlyRevenueData = await this.getMonthlyRevenue({
      year: currentYear,
    });

    // Calculate growth
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [revenueThisMonth, revenueLastMonth] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESS,
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESS,
          createdAt: { gte: lastMonth, lte: endOfLastMonth },
        },
        _sum: { amount: true },
      }),
    ]);

    const thisMonthAmount = revenueThisMonth._sum.amount || 0;
    const lastMonthAmount = revenueLastMonth._sum.amount || 0;

    const revenueGrowth =
      lastMonthAmount > 0
        ? ((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 100
        : thisMonthAmount > 0
          ? 100
          : 0;

    return {
      totalPayments: total,
      pendingPayments: pending,
      successPayments: success,
      failedPayments: failed,
      totalRevenue,
      revenueThisMonth: thisMonthAmount,
      revenueLastMonth: lastMonthAmount,
      revenueGrowth: Math.round(revenueGrowth * 100) / 100,
      monthlyRevenue: monthlyRevenueData.data,
    };
  }

  /**
   * Handle VNPay return callback
   * Verify signature, update payment status, emit RabbitMQ event
   */
  async handleVNPayReturn(query: any): Promise<{
    success: boolean;
    message: string;
    paymentId?: string;
    bookingId?: string;
    status?: PaymentStatus;
  }> {
    this.logger.log(`[handleVNPayReturn] Received VNPay return: ${JSON.stringify(query)}`);

    // Verify signature
    const isValidSignature = this.vnpay.verifyVNPaySignature(query);
    if (!isValidSignature) {
      this.logger.warn('[handleVNPayReturn] Invalid signature');
      return { success: false, message: 'Invalid signature' };
    }

    // Extract VNPay response data
    const vnpResponseCode = query.vnp_ResponseCode;
    const vnpTxnRef = query.vnp_TxnRef;
    const vnpAmount = parseInt(query.vnp_Amount, 10) / 100; // VNPay amount is in cents
    const vnpTransactionNo = query.vnp_TransactionNo;

    // Find payment by reference (vnp_TxnRef)
    const payment = await this.prisma.payment.findFirst({
      where: { reference: vnpTxnRef, method: PaymentMethod.VNPAY },
    });

    if (!payment) {
      this.logger.warn(`[handleVNPayReturn] Payment not found for ref=${vnpTxnRef}`);
      return { success: false, message: 'Payment not found' };
    }

    // Check if already processed
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(`[handleVNPayReturn] Payment already success ref=${vnpTxnRef}`);
      return {
        success: true,
        message: 'Already processed',
        paymentId: payment.id,
        bookingId: payment.bookingId,
        status: PaymentStatus.SUCCESS,
      };
    }

    // Check amount match
    if (payment.amount !== vnpAmount) {
      this.logger.warn(
        `[handleVNPayReturn] Amount mismatch ref=${vnpTxnRef} expected=${payment.amount} received=${vnpAmount}`,
      );
      return { success: false, message: 'Amount mismatch' };
    }

    // Process based on response code
    if (vnpResponseCode === '00') {
      // Payment successful
      this.logger.log(`[handleVNPayReturn] Payment success ref=${vnpTxnRef}`);

      // Update payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          transactionId: vnpTransactionNo,
          paymentDate: new Date(),
        },
      });

      // Emit RabbitMQ event for booking service
      await this.rabbitmq.emitPaymentEvent('payment.success', {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        amount: payment.amount,
        status: PaymentStatus.SUCCESS,
        transactionId: vnpTransactionNo,
        reference: vnpTxnRef,
      });

      this.logger.log(`[handleVNPayReturn] Payment ${payment.id} => SUCCESS, published payment.success`);

      return {
        success: true,
        message: 'Payment successful',
        paymentId: payment.id,
        bookingId: payment.bookingId,
        status: PaymentStatus.SUCCESS,
      };
    } else {
      // Payment failed
      this.logger.warn(`[handleVNPayReturn] Payment failed ref=${vnpTxnRef} code=${vnpResponseCode}`);

      // Update payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          transactionId: vnpTransactionNo || undefined,
        },
      });

      // Emit RabbitMQ event
      await this.rabbitmq.emitPaymentEvent('payment.failed', {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        amount: payment.amount,
        status: PaymentStatus.FAILED,
        transactionId: vnpTransactionNo || undefined,
        reference: vnpTxnRef,
      });

      this.logger.log(`[handleVNPayReturn] Payment ${payment.id} => FAILED, published payment.failed`);

      return {
        success: false,
        message: `Payment failed with code: ${vnpResponseCode}`,
        paymentId: payment.id,
        bookingId: payment.bookingId,
        status: PaymentStatus.FAILED,
      };
    }
  }

  /**
   * Handle VNPay IPN (Instant Payment Notification)
   * Server-to-server callback for reliability
   */
  async handleVNPayIpn(query: any): Promise<{ RspCode: string; Message: string }> {
    this.logger.log(`[handleVNPayIpn] Received VNPay IPN: ${JSON.stringify(query)}`);

    try {
      // 1. Verify signature
      const isValidSignature = this.vnpay.verifyVNPaySignature(query);
      if (!isValidSignature) {
        this.logger.warn('[handleVNPayIpn] Invalid signature');
        return { RspCode: '97', Message: 'Invalid signature' };
      }

      // 2. Extract data
      const vnpTxnRef = query.vnp_TxnRef;
      const vnpAmount = parseInt(query.vnp_Amount, 10) / 100;
      const vnpResponseCode = query.vnp_ResponseCode;
      const vnpTransactionNo = query.vnp_TransactionNo;

      // 3. Find payment
      const payment = await this.prisma.payment.findFirst({
        where: { reference: vnpTxnRef, method: PaymentMethod.VNPAY },
      });

      if (!payment) {
        this.logger.warn(`[handleVNPayIpn] Order not found ref=${vnpTxnRef}`);
        return { RspCode: '01', Message: 'Order not found' };
      }

      // 4. Check amount
      if (payment.amount !== vnpAmount) {
        this.logger.warn(`[handleVNPayIpn] Amount mismatch ref=${vnpTxnRef} expected=${payment.amount} received=${vnpAmount}`);
        return { RspCode: '04', Message: 'Amount mismatch' };
      }

      // 5. Check if already processed
      if (payment.status !== PaymentStatus.PENDING) {
        this.logger.log(`[handleVNPayIpn] Order already processed ref=${vnpTxnRef} status=${payment.status}`);
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      // 6. Update status based on response code
      if (vnpResponseCode === '00') {
        // Success
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            transactionId: vnpTransactionNo,
            paymentDate: new Date(),
          },
        });

        // Emit message to RabbitMQ
        await this.rabbitmq.emitPaymentEvent('payment.success', {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          amount: payment.amount,
          status: PaymentStatus.SUCCESS,
          transactionId: vnpTransactionNo,
          reference: vnpTxnRef,
        });

        this.logger.log(`[handleVNPayIpn] Payment SUCCESS confirmed ref=${vnpTxnRef}`);
      } else {
        // Failed
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            transactionId: vnpTransactionNo || undefined,
          },
        });

        // Emit message to RabbitMQ
        await this.rabbitmq.emitPaymentEvent('payment.failed', {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          amount: payment.amount,
          status: PaymentStatus.FAILED,
          transactionId: vnpTransactionNo || undefined,
          reference: vnpTxnRef,
        });

        this.logger.log(`[handleVNPayIpn] Payment FAILED confirmed ref=${vnpTxnRef} code=${vnpResponseCode}`);
      }

      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (error) {
      this.logger.error(`[handleVNPayIpn] Error: ${error.message}`, error.stack);
      return { RspCode: '99', Message: 'Unknown error' };
    }
  }
}
