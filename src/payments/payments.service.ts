import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PaymentStatus, PaymentMethod } from '@prisma/client';
import { VietqrProvider } from './provider/vietqr.provider';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RabbitMQProducerService } from 'src/messaging/rabbitmq/rabbitmq.producer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { ExternalService } from 'src/common/external/external.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vietqr: VietqrProvider,
    private readonly rabbitmq: RabbitMQProducerService,
    private readonly externalService: ExternalService,
  ) {}

  private providerFor(method: PaymentMethod | string) {
    if (String(method).toUpperCase() === 'VIETQR') return this.vietqr;
    throw new BadRequestException('Unsupported provider');
  }

  // create payment and return record + qr url
  async createPayment(userId: string, dto: CreatePaymentDto) {
    if (!dto.bookingId || !dto.amount || !dto.method) {
      throw new BadRequestException('Missing required fields: bookingId, amount, method');
    }
    
    const provider = this.providerFor(dto.method);
    const { qrImageUrl, paymentUrl, reference } = await provider.createPayment({
      amount: dto.amount,
      orderId: dto.bookingId,
      addInfo: `BOOKING_${dto.bookingId}`,
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId: userId,
        bookingId: dto.bookingId,
        amount: dto.amount,
        method: dto.method as PaymentMethod,
        qrImageUrl: qrImageUrl || undefined,
        paymentUrl: paymentUrl || undefined,
        reference: reference || undefined,
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(`Payment created ${payment.id}`);
    return payment;
  }

  // update status and publish rabbitmq
  async updateStatusByPaymentId(paymentId: string, status: PaymentStatus, transactionId?: string) {
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        transactionId: transactionId ?? undefined,
        paymentDate: status === PaymentStatus.SUCCESS ? new Date() : undefined,
      },
    });

    const topic = status === PaymentStatus.SUCCESS ? 'payment.success' : 'payment.failed';
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

  async verifyPaymentFromEmail(data: { bookingId: string; amount: number; rawMessage: string }) {
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

    this.logger.log(`✅ Payment verified for booking ${bookingId}, event pushed.`);
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

// test VietQR configuration
async testVietQRConfig() {
  try {
    const testPayment = await this.vietqr.createPayment({
      amount: 100000,
      orderId: 'TEST_123',
      addInfo: 'BOOKING_TEST_123',
    });

    return {
      success: true,
      message: 'VietQR configuration is working',
      config: {
        accountNo: process.env.VIETQR_ACCOUNT_NO,
        acqId: process.env.VIETQR_ACQ_ID,
        accountName: process.env.VIETQR_ACCOUNT_NAME,
      },
      testPayment,
    };
  } catch (error) {
    return {
      success: false,
      message: 'VietQR configuration error',
      error: error.message,
      config: {
        accountNo: process.env.VIETQR_ACCOUNT_NO,
        acqId: process.env.VIETQR_ACQ_ID,
        accountName: process.env.VIETQR_ACCOUNT_NAME,
      },
    };
  }
}



}
