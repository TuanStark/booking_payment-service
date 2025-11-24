import { Injectable, Logger } from '@nestjs/common';
import { generateSignature } from '../payos-utils';
import { PayosRequestPaymentPayload } from '../dto/payos/payos-request-payment.payload';
import { firstValueFrom } from 'rxjs';
import { PayosPaymentCreatedResponse } from '../dto/payos/payos-payment-created.response';
import {
  PayosWebhookData,
  PayosWebhookType,
} from '../dto/payos/payos-webhook-body.payload';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VietqrProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) { }

  async createPayment(body: CreatePaymentDto): Promise<any> {
    const url = `https://api-merchant.payos.vn/v2/payment-requests`;
    const config = {
      headers: {
        'x-client-id': this.configService.getOrThrow<string>('PAYOS_CLIENT_ID'),
        'x-api-key': this.configService.getOrThrow<string>('PAYOS_API_KEY'),
      },
    };
    // Generate a numeric orderCode (required by PayOS)
    // Using timestamp (last 6 digits) + random (4 digits) to ensure uniqueness and fit in safe integer
    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 10000).toString().padStart(4, '0'));

    const dataForSignature = {
      orderCode: orderCode,
      amount: body.amount ?? 0,
      description: `Booking ${orderCode}`, // Shorten description to fit 25 chars limit
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
    Logger.debug(`[VietqrProvider] PayOS Response: ${JSON.stringify(response.data)}`);
    return response.data as unknown as PayosPaymentCreatedResponse;
  }

  verifyWebhook(webhookBody: PayosWebhookType): PayosWebhookData {
    const { data, signature } = webhookBody;
    if (!data || !signature) {
      throw new Error('Invalid webhook body');
    }

    const calculatedSignature = generateSignature(
      data as unknown as Record<string, unknown>,
      this.configService.getOrThrow<string>('PAYOS_CHECKSUM_KEY'),
    );

    if (calculatedSignature !== signature) {
      throw new Error('Invalid signature');
    }

    return data;
  }

  handleWebhook() {
    // Deprecated, logic moved to service
    return { received: true };
  }
}
