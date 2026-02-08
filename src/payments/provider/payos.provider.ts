import { Injectable, Logger } from '@nestjs/common';
import { PayOS } from '@payos/node';
import { CreatePaymentLinkRequest, Webhook } from '@payos/node';

@Injectable()
export class PayosProvider {
    private readonly logger = new Logger(PayosProvider.name);
    private payos: PayOS;

    constructor() {
        this.payos = new PayOS({
            clientId: process.env.PAYOS_CLIENT_ID,
            apiKey: process.env.PAYOS_API_KEY,
            checksumKey: process.env.PAYOS_CHECKSUM_KEY,
        });
    }

    async createPaymentLink(paymentData: CreatePaymentLinkRequest) {
        try {
            const paymentLink = await this.payos.paymentRequests.create(paymentData);
            return paymentLink;
        } catch (error) {
            this.logger.error(`Error creating payment link: ${error.message}`);
            throw error;
        }
    }

    verifyWebhookData(webhookData: Webhook) {
        try {
            const data = this.payos.webhooks.verify(webhookData);
            return data;
        } catch (error) {
            this.logger.error(`Error verifying webhook data: ${error.message}`);
            throw error;
        }
    }
}
