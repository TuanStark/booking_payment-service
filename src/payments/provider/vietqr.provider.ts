import { Injectable, Logger } from '@nestjs/common';
import { generateSignature } from '../payos-utils';
import { PayosRequestPaymentPayload } from '../dto/payos/payos-request-payment.payload';
import { firstValueFrom } from 'rxjs';
import { PayosPaymentCreatedResponse } from '../dto/payos/payos-payment-created.response';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VietqrProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createPayment(body: CreatePaymentDto): Promise<any> {
    const url = `https://api-merchant.payos.vn/v2/payment-requests`;
    const config = {
      headers: {
        'x-client-id': this.configService.getOrThrow<string>('PAYOS_CLIENT_ID'),
        'x-api-key': this.configService.getOrThrow<string>('PAYOS_API_KEY'),
      },
    };
    const dataForSignature = {
      orderCode: Number(body.bookingId),
      amount: body.amount ?? 0,
      description: `Thanh toan booking ${body.bookingId}`,
      cancelUrl: 'https://example.com/cancel',
      returnUrl: 'https://example.com/return',
    };
    const signature = generateSignature(
      dataForSignature,
      this.configService.getOrThrow<string>('PAYOS_CHECKSUM_KEY'),
    );
    const payload: PayosRequestPaymentPayload = {
      ...dataForSignature,
      signature,
    };
    const response = await firstValueFrom(
      this.httpService.post(url, payload, config),
    );
    return response.data as unknown as PayosPaymentCreatedResponse;
  }

  handleWebhook() {
    // TODO: Parse provider event and update payment
    return { received: true };
  }
}
