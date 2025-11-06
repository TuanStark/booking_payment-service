import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto-js';
import * as crypto_node from 'crypto';
import axios from 'axios';
import moment from 'moment';
import * as qs from 'qs';
import { IPaymentProvider } from './payment-provider.interface';

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

export interface VNPayPaymentRequest {
  orderId: string;
  amount: number;
  orderInfo: string;
  returnUrl: string;
  ipAddr: string;
  locale?: string;
}

export interface VNPayPaymentResponse {
  vnpUrl: string;
  orderId: string;
  amount: number;
}

@Injectable()
export class PaymentVNPayProvider {
  // VNPay Configuration
  private readonly vnpTmnCode = process.env.VNPAY_TMN_CODE || '2QXUI4B4';
  private readonly vnpHashSecret = process.env.VNPAY_HASH_SECRET || 'RAOEVONQL3DQIQMP7UYXNPGXCVOQFUYD';
  private readonly vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly vnpVersion = '2.1.0';
  private readonly vnpCommand = 'pay';
  private readonly vnpCurrCode = 'VND';
  
  async createVNPayPayment(paymentData: VNPayPaymentRequest): Promise<VNPayPaymentResponse> {
    try {
      const createDate = moment().format('YYYYMMDDHHmmss');
      const expireDate = moment().add(15, 'minutes').format('YYYYMMDDHHmmss');

      const vnpParams: any = {
        vnp_Version: this.vnpVersion,
        vnp_Command: this.vnpCommand,
        vnp_TmnCode: this.vnpTmnCode,
        vnp_Amount: paymentData.amount * 100, // VNPay requires amount in VND cents
        vnp_CurrCode: this.vnpCurrCode,
        vnp_TxnRef: paymentData.orderId,
        vnp_OrderInfo: paymentData.orderInfo,
        vnp_OrderType: 'other',
        vnp_Locale: paymentData.locale || 'vn',
        vnp_ReturnUrl: paymentData.returnUrl,
        vnp_IpAddr: paymentData.ipAddr,
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate,
      };

      const sortedParams = this.sortObject(vnpParams);

      const signData = Object.keys(sortedParams)
        .sort()
        .filter(key => sortedParams[key] !== '' && sortedParams[key] !== null && sortedParams[key] !== undefined)
        .map(key => `${key}=${encodeURIComponent(sortedParams[key])}`)
        .join('&');

      console.log('VNPay Sign Data:', signData);
      console.log('VNPay Hash Secret:', this.vnpHashSecret);

      const signed = crypto_node
        .createHmac('sha512', this.vnpHashSecret)
        .update(signData, 'utf8')
        .digest('hex')
        .toUpperCase();

      console.log('VNPay Signature:', signed);


      const vnpUrl = this.vnpUrl + '?' + qs.stringify(sortedParams, { encode: false });

      console.log('VNPay Request URL:', vnpUrl);

      return {
        vnpUrl,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
      };
    } catch (error) {
      console.error('VNPay Payment Error:', error);
      throw new BadRequestException('Failed to create VNPay payment');
    }
  }

  verifyVNPaySignature(vnpParams: any): boolean {
    try {
      const secureHash = vnpParams.vnp_SecureHash;

      const params = { ...vnpParams };
      delete params.vnp_SecureHash;
      delete params.vnp_SecureHashType;

      const sortedParams = this.sortObject(params);

      const signData = Object.keys(sortedParams)
        .sort()
        .filter(key => sortedParams[key] !== '' && sortedParams[key] !== null && sortedParams[key] !== undefined)
        .map(key => `${key}=${encodeURIComponent(sortedParams[key])}`)
        .join('&');

      console.log('VNPay Verify Sign Data:', signData);

      const signed = crypto_node
        .createHmac('sha512', this.vnpHashSecret)
        .update(signData, 'utf8')
        .digest('hex')
        .toUpperCase();

      console.log('VNPay Expected Signature:', signed);
      console.log('VNPay Received Signature:', secureHash);

      const isValid = secureHash.toUpperCase() === signed.toUpperCase();
      console.log('VNPay Signature Valid:', isValid);

      return isValid;
    } catch (error) {
      console.error('VNPay signature verification error:', error);
      return false;
    }
  }

  private sortObject(obj: any): any {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    keys.forEach(key => {
      sorted[key] = obj[key];
    });
    return sorted;
  }

  
}
