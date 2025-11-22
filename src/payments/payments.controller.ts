import { Controller, Post, Body, Get, Param, Req, Query, HttpException, UseGuards, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './dto/enum';
import { CreatePaymentDto, VerifyPaymentDto } from './dto/create-payment.dto';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { HttpMessage, HttpStatus } from 'src/common/global/globalEnum';
import { ResponseData } from 'src/common/global/globalClass';
import { BadRequestException } from '@nestjs/common';
import { PaymentVNPayProvider } from './provider/vnpay.provider';
import { VietqrProvider } from './provider/vietqr.provider';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly vnpayProvider: PaymentVNPayProvider,
    private readonly vietqrProvider: VietqrProvider,
    private readonly configService: ConfigService,
  ) {}

  // @Post('vnpay/create')
  // async createVNPayPayment(@Body() createVNPayPaymentDto: CreateVNPayPaymentDto) {
  //   try {
  //     const paymentResponse = await this.vnpayProvider.createVNPayPayment(createVNPayPaymentDto);
  //     return new ResponseData(paymentResponse, HttpStatus.CREATED, HttpMessage.CREATED);
  //   } catch (error) {
  //     throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
  //   }
  // }

  @Post('vnpay/verify')
  async verifyVNPaySignature(@Body() vnpParams: any) {
    try {
      const isValid = this.vnpayProvider.verifyVNPaySignature(vnpParams);
      return new ResponseData({ isValid, params: vnpParams }, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Lấy IP address từ request (giống logic code mẫu VNPay)
   */
  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      req.connection.remoteAddress ||
      (req.connection as any).socket?.remoteAddress ||
      '127.0.0.1'
    );
  }

  @Post()
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    // Extract userId from x-user-id header sent by API Gateway
    const userId = req.headers['x-user-id'] as string;
    const clientIp = this.getClientIp(req);
    
    this.logger.debug(
      `[create] Payment request: userId=${userId}, method=${createPaymentDto.method}, amount=${createPaymentDto.amount}, ip=${clientIp}`,
    );

    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.paymentsService.createPayment(userId, {
      ...createPaymentDto,
      ipAddr: clientIp,
    } as any);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.paymentsService.getPayment(id);
  }

  @Get()
  async findAll(@Query() query: FindAllDto, @Req() req: Request) {
    try {
      // Lấy token từ request header (từ API Gateway forward xuống)
      const authHeader = req.headers['authorization'] as string;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

      const payments = await this.paymentsService.findAll(query, token);
      return new ResponseData(
        payments,
        HttpStatus.SUCCESS,
        HttpMessage.SUCCESS,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // manual verify endpoint (for testing)
  @Post(':id/verify')
  async manualVerify(
    @Param('id') id: string,
    @Body() verifyPaymentDto: VerifyPaymentDto,
  ) {
    return this.paymentsService.updateStatusByPaymentId(
      id,
      PaymentStatus.SUCCESS,
      verifyPaymentDto.transactionId,
    );
  }

  @Get('/vnpay/return')
  async vnpayReturn(@Query() query: Record<string, any>, @Res() res: Response) {
    try {
      // Dùng service để xử lý (sẽ viết ở dưới)
      const result = await this.paymentsService.handleVnpayReturn(query);

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

      if (result.success) {
        // Chuyển về frontend của bạn (React/Vue/Next.js...)
        return res.redirect(
          `${frontendUrl}/payment/success?bookingId=${result.payment?.bookingId}`,
        );
      } else {
        return res.redirect(
          `${frontendUrl}/payment/failed?code=${result.code || '99'}`,
        );
      }
    } catch (error) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      return res.redirect(
        `${frontendUrl}/payment/failed?code=99`,
      );
    }
  }

  // IPN – BẮT BUỘC PHẢI CÓ (VNPay gọi về server)
  @Post('/vnpay/ipn')
  async vnpayIpn(@Req() req: Request, @Res() res: Response) {
    const result = await this.paymentsService.handleVnpayIpn(req.query as any);

    // VNPay yêu cầu trả về JSON đúng format
    return res.json(result);
  }

// vietqr
  @Post('vietqr/create')
  async createPayment(@Body() body: CreatePaymentDto): Promise<any> {
    return this.vietqrProvider.createPayment(body);
  }

  @Post('webhook')
  handleWebhook() {
    return this.vietqrProvider.handleWebhook();
  }

  /**
   * GET /payments/revenue/monthly
   * Query params:
   *   - year?: number (default: current year)
   *   - startDate?: string (ISO format)
   *   - endDate?: string (ISO format)
   *   - method?: PaymentMethod
   */
  @Get('/revenue/monthly')
  async getMonthlyRevenue(
    @Query('year') year?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('method') method?: string,
  ) {
    try {
      const result = await this.paymentsService.getMonthlyRevenue({
        year,
        startDate,
        endDate,
        method,
      });
      return new ResponseData(result, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
