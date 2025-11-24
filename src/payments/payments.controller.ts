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
import type { PayosWebhookType } from './dto/payos/payos-webhook-body.payload';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly vnpayProvider: PaymentVNPayProvider,
    private readonly vietqrProvider: VietqrProvider,
    private readonly configService: ConfigService,
  ) { }
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

  // vietqr
  @Post('vietqr/create')
  async createPayment(@Body() body: CreatePaymentDto): Promise<any> {
    return this.vietqrProvider.createPayment(body);
  }

  @Post('webhook')
  handleWebhook(@Body() body: PayosWebhookType) {
    console.log("body webhook", body);
    return this.paymentsService.handleVietqrWebhook(body);
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
