import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import moment from 'moment';

export interface VNPayPaymentRequest {
  orderId: string;
  amount: number;           // đơn vị: VND (ví dụ: 50000 = 50.000đ)
  orderInfo: string;     // mô tả đơn hàng, có thể có tiếng Việt
  returnUrl: string;       // URL trả về sau khi thanh toán (PHẢI là https:// trên production)
  ipAddr: string;          // IP của client
  locale?: 'vn' | 'en';    // mặc định vn
  bankCode?: string;       // mã ngân hàng (nếu muốn chọn sẵn)
}

export interface VNPayPaymentResponse {
  vnpUrl: string;
  orderId: string;
  amount: number;
}

@Injectable()
export class PaymentVNPayProvider {
  // Cấu hình VNPay - nên để trong .env, không hardcode
  private readonly vnpTmnCode = process.env.VNPAY_TMN_CODE!;
  private readonly vnpHashSecret = process.env.VNPAY_HASH_SECRET!;
  private readonly vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly vnpApiUrl = process.env.VNPAY_API_URL || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

  // Hàm tạo chữ ký đúng chuẩn VNPay (SHA512 + %20 → +)
  // SỬA LỚN NHẤT Ở ĐÂY
  private createSecureHash(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort();

    const signData = sortedKeys
      .map((key) => {
        const value = params[key] === null || params[key] === undefined ? '' : params[key];
        // QUAN TRỌNG: thay %20 thành dấu +
        return `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`;
      })
      .join('&');

    return crypto
      .createHmac('sha512', this.vnpHashSecret)
      .update(signData, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  // Tạo link thanh toán VNPay
  async createVNPayPayment(
    paymentData: VNPayPaymentRequest,
  ): Promise<VNPayPaymentResponse> {
    try {
      // Thời gian Việt Nam (GMT+7)
      const createDate = moment().utcOffset('+07:00').format('YYYYMMDDHHmmss');
      const expireDate = moment().utcOffset('+07:00').add(15, 'minutes').format('YYYYMMDDHHmmss');

      // VNPay yêu cầu amount nhân 100 và là string
      const vnpAmount = Math.round(paymentData.amount * 100).toString();

      // Làm sạch orderId (chỉ cho phép chữ, số, _, -)
      const vnpTxnRef = String(paymentData.orderId)
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 100);

      // Params chính thức gửi sang VNPay
      const vnpParams: Record<string, any> = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: this.vnpTmnCode,
        vnp_Amount: vnpAmount,
        vnp_CurrCode: 'VND',
        vnp_TxnRef: vnpTxnRef,
        vnp_OrderInfo: (paymentData.orderInfo || 'Thanh toan don hang').substring(0, 255),
        vnp_OrderType: 'other', // hoặc 250001 cho topping up, xem tài liệu VNPay
        vnp_Locale: paymentData.locale || 'vn',
        vnp_ReturnUrl: paymentData.returnUrl, // bắt buộc https:// trên production
        vnp_IpAddr: (paymentData.ipAddr || '127.0.0.1').substring(0, 45),
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate,
      };

      // THÊM MỚI: nếu có chọn ngân hàng thì thêm
      if (paymentData.bankCode) {
        vnpParams.vnp_BankCode = paymentData.bankCode;
      }

      // Tạo chữ ký
      vnpParams.vnp_SecureHash = this.createSecureHash(vnpParams);

      // Tạo query string đúng format (cùng cách encode như khi tạo hash)
      const queryString = Object.keys(vnpParams)
        .sort()
        .map((key) => {
          const value = vnpParams[key];
          return `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`;
        })
        .join('&');

      const paymentUrl = `${this.vnpUrl}?${queryString}`;

      // Log để debug (có thể xóa khi production)
      console.log('VNPay Payment URL:', paymentUrl);

      return {
        vnpUrl: paymentUrl,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
      };
    } catch (error) {
      console.error('VNPay create payment error:', error);
      throw new BadRequestException('Không thể tạo link thanh toán VNPay');
    }
  }

  // Xác minh chữ ký trả về từ VNPay (return URL hoặc IPN)
  // SỬA LỚN: dùng lại hàm createSecureHash, không sort 2 lần
  verifyVNPaySignature(vnpParams: Record<string, any>): boolean {
    try {
      const receivedHash = vnpParams.vnp_SecureHash;
      if (!receivedHash) return false;

      // Copy và xóa hash khỏi params
      const params = { ...vnpParams };
      delete params.vnp_SecureHash;
      delete params.vnp_SecureHashType; // nếu có

      const calculatedHash = this.createSecureHash(params);

      const isValid = receivedHash.toUpperCase() === calculatedHash;

      console.log('VNPay Verify - Received:', receivedHash);
      console.log('VNPay Verify - Expected:', calculatedHash);
      console.log('VNPay Verify Result:', isValid);

      return isValid;
    } catch (error) {
      console.error('VNPay verify signature error:', error);
      return false;
    }
  }

  // Hàm tiện ích: kiểm tra giao dịch thành công từ return/IPN
  isPaymentSuccess(vnpParams: Record<string, any>): boolean {
    return (
      this.verifyVNPaySignature(vnpParams) &&
      vnpParams.vnp_ResponseCode === '00' &&
      vnpParams.vnp_TransactionStatus === '00'
    );
  }

  // Optional: Hàm query giao dịch (dùng khi cần kiểm tra trạng thái)
  // async queryDR(...) { ... }
}