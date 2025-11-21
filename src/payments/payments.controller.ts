import { Controller, Post, Body, Get, Param, Req, Query, HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from '@prisma/client';
import { CreatePaymentDto, CreateVNPayPaymentDto, VerifyPaymentDto } from './dto/create-payment.dto';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { HttpMessage, HttpStatus } from 'src/common/global/globalEnum';
import { ResponseData } from 'src/common/global/globalClass';
import { BadRequestException } from '@nestjs/common';
import { PaymentVNPayProvider } from './provider/vnpay.provider';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService,
    private readonly vnpayProvider: PaymentVNPayProvider,
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

  @Get('vnpay/test')
  async testVNPaySignature(@Query() query: any) {
    try {
      console.log('VNPay Test Query:', query);

      // Test signature verification
      const isValid = this.vnpayProvider.verifyVNPaySignature(query);

      return new ResponseData({
        isValid,
        receivedParams: query,
        message: isValid ? 'Signature is valid' : 'Signature is invalid'
      }, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('vnpay/config')
  async getVNPayConfig() {
    try {
      // Return VNPay configuration (without sensitive data)
      return new ResponseData({
        vnpUrl: process.env.VNPAY_URL,
        vnpTmnCode: process.env.VNPAY_TMN_CODE,
        hasHashSecret: !!process.env.VNPAY_HASH_SECRET,
        hashSecretLength: process.env.VNPAY_HASH_SECRET?.length || 0,
        environment: process.env.NODE_ENV || 'development'
      }, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post()
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    // Extract userId from x-user-id header sent by API Gateway
    const userId = req.headers['x-user-id'] as string;
    console.log('Create payment request received:', createPaymentDto);
    console.log('UserId from header:', userId);

    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.paymentsService.createPayment(userId, {
      ...createPaymentDto,
    });
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

  // test VietQR configuration
  @Get('test/vietqr')
  async testVietQR() {
    return this.paymentsService.testVietQRConfig();
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
