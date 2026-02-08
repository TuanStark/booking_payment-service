import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto-js';
import axios from 'axios';


export interface MoMoPaymentRequest {
    orderId: string;
    amount: number;
    orderInfo: string;
    redirectUrl: string;
    ipnUrl: string;
    extraData?: string;
}

export interface MoMoPaymentResponse {
    partnerCode: string;
    orderId: string;
    requestId: string;
    amount: number;
    responseTime: number;
    message: string;
    resultCode: number;
    payUrl?: string;
    deeplink?: string;
    qrCodeUrl?: string;
}

@Injectable()
export class PaymentMomoProvider {
    // MoMo Configuration
    private readonly partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMO';
    private readonly accessKey = process.env.MOMO_ACCESS_KEY || '';
    private readonly secretKey = process.env.MOMO_SECRET_KEY || '';
    private readonly endpoint = process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create';


    async createMoMoPayment(paymentData: MoMoPaymentRequest): Promise<MoMoPaymentResponse> {
        try {
            const requestId = paymentData.orderId;
            const requestType = 'captureWallet';
            const extraData = paymentData.extraData || '';
            const orderGroupId = '';
            const autoCapture = true;
            const lang = 'vi';

            // Create raw signature
            const rawSignature = `accessKey=${this.accessKey}&amount=${paymentData.amount}&extraData=${extraData}&ipnUrl=${paymentData.ipnUrl}&orderId=${paymentData.orderId}&orderInfo=${paymentData.orderInfo}&partnerCode=${this.partnerCode}&redirectUrl=${paymentData.redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

            // Generate signature
            const signature = crypto.HmacSHA256(rawSignature, this.secretKey).toString();

            const requestBody = {
                partnerCode: this.partnerCode,
                partnerName: 'Test',
                storeId: 'MomoTestStore',
                requestId: requestId,
                amount: paymentData.amount,
                orderId: paymentData.orderId,
                orderInfo: paymentData.orderInfo,
                redirectUrl: paymentData.redirectUrl,
                ipnUrl: paymentData.ipnUrl,
                lang: lang,
                requestType: requestType,
                autoCapture: autoCapture,
                extraData: extraData,
                orderGroupId: orderGroupId,
                signature: signature,
            };

            console.log('MoMo Request Body:', JSON.stringify(requestBody, null, 2));

            const response = await axios.post(this.endpoint, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            console.log('MoMo Response:', response.data);

            if (response.data.resultCode === 0) {
                return response.data;
            } else {
                throw new BadRequestException(`MoMo payment failed: ${response.data.message}`);
            }
        } catch (error) {
            console.error('MoMo Payment Error:', error);
            throw new BadRequestException('Failed to create MoMo payment');
        }
    }

    verifyMoMoSignature(data: any): boolean {
        try {
            const {
                partnerCode,
                orderId,
                requestId,
                amount,
                orderInfo,
                orderType,
                transId,
                resultCode,
                message,
                payType,
                responseTime,
                extraData,
                signature
            } = data;

            const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;

            const expectedSignature = crypto.HmacSHA256(rawSignature, this.secretKey).toString();

            return signature === expectedSignature;
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }

}