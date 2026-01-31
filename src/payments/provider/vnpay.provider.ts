import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto_node from 'crypto';
import moment from 'moment';

export interface VNPayPaymentRequest {
  orderId: string;
  amount: number;
  orderInfo: string;
  returnUrl?: string; // Optional - sẽ lấy từ env nếu không truyền
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
  private readonly logger = new Logger(PaymentVNPayProvider.name);
  // Cấu hình VNPay - nên để trong .env, không hardcode
  private readonly vnpTmnCode = process.env.VNPAY_TMN_CODE || '2QXUI4B4';
  private readonly vnpHashSecret = process.env.VNPAY_HASH_SECRET || 'RAOEVONQL3DQIQMP7UYXNPGXCVOQFUYD';
  private readonly vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly vnpVersion = '2.1.0';
  private readonly vnpCommand = 'pay';
  private readonly vnpCurrCode = 'VND';

  private readonly vnpReturnUrl = process.env.VNPAY_RETURN_URL || 'http://localhost:4000/payment/vnpay/return';

  // PHP-style URL encode (spaces become '+' instead of '%20')
  private urlEncode(str: string): string {
    return encodeURIComponent(str).replace(/%20/g, '+');
  }

  async createVNPayPayment(paymentData: VNPayPaymentRequest): Promise<VNPayPaymentResponse> {
    try {
      const createDate = moment().format('YYYYMMDDHHmmss');
      const expireDate = moment().add(15, 'minutes').format('YYYYMMDDHHmmss');

      // Sử dụng returnUrl từ param hoặc từ env
      const returnUrl = paymentData.returnUrl || this.vnpReturnUrl;

      const vnpParams: Record<string, string | number> = {
        vnp_Version: this.vnpVersion,
        vnp_Command: this.vnpCommand,
        vnp_TmnCode: this.vnpTmnCode,
        vnp_Amount: paymentData.amount * 100, // VNPay requires amount in VND cents
        vnp_CurrCode: this.vnpCurrCode,
        vnp_TxnRef: paymentData.orderId,
        vnp_OrderInfo: paymentData.orderInfo,
        vnp_OrderType: 'other',
        vnp_Locale: paymentData.locale || 'vn',
        vnp_ReturnUrl: returnUrl,
        vnp_IpAddr: paymentData.ipAddr,
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate,
      };

      // Sort parameters alphabetically by key name
      const sortedKeys = Object.keys(vnpParams).sort();

      // Build hashData and queryString according to VNPay official docs
      // Using PHP-style encoding (spaces as '+')
      let hashData = '';
      let queryString = '';

      for (let i = 0; i < sortedKeys.length; i++) {
        const key = sortedKeys[i];
        const value = String(vnpParams[key]);

        if (value !== null && value !== undefined && value.length > 0) {
          // Build hash data - key NOT encoded, value encoded (PHP-style)
          hashData += key + '=' + this.urlEncode(value);
          // Build query string - both key and value encoded (PHP-style)
          queryString += this.urlEncode(key) + '=' + this.urlEncode(value);

          if (i < sortedKeys.length - 1) {
            hashData += '&';
            queryString += '&';
          }
        }
      }

      console.log('VNPay Hash Data:', hashData);
      console.log('VNPay Hash Secret:', this.vnpHashSecret);

      // Create HMAC SHA512 signature
      const signed = crypto_node
        .createHmac('sha512', this.vnpHashSecret)
        .update(hashData)
        .digest('hex');

      console.log('VNPay Signature:', signed);

      // Append signature to query string
      queryString += '&vnp_SecureHash=' + signed;

      // Create payment URL
      const vnpUrl = this.vnpUrl + '?' + queryString;

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

      // Create a copy to avoid modifying original
      const params = { ...vnpParams };
      delete params.vnp_SecureHash;
      delete params.vnp_SecureHashType;

      // Sort parameters alphabetically by key name
      const sortedKeys = Object.keys(params).sort();

      // Build hashData: key=URLEncode(value)&key2=URLEncode(value2) (key NOT encoded, PHP-style)
      let hashData = '';

      for (let i = 0; i < sortedKeys.length; i++) {
        const key = sortedKeys[i];
        const value = String(params[key]);

        if (value !== null && value !== undefined && value.length > 0) {
          // Build hash data - key NOT encoded, value encoded (PHP-style)
          hashData += key + '=' + this.urlEncode(value);

          if (i < sortedKeys.length - 1) {
            hashData += '&';
          }
        }
      }

      console.log('VNPay Verify Hash Data:', hashData);

      // Create HMAC SHA512 signature
      const signed = crypto_node
        .createHmac('sha512', this.vnpHashSecret)
        .update(hashData)
        .digest('hex');

      console.log('VNPay Expected Signature:', signed);
      console.log('VNPay Received Signature:', secureHash);

      // Compare signatures case-insensitive
      const isValid = secureHash.toLowerCase() === signed.toLowerCase();
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
