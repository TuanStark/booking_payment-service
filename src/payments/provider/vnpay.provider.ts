import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import moment from 'moment';

export interface VNPayPaymentRequest {
  orderId: string;
  amount: number; // đơn vị: VND (ví dụ: 50000 = 50.000đ)
  orderInfo: string; // mô tả đơn hàng, có thể có tiếng Việt
  returnUrl: string; // URL trả về sau khi thanh toán (PHẢI là https:// trên production)
  ipAddr: string; // IP của client
  locale?: 'vn' | 'en'; // mặc định vn
  bankCode?: string; // mã ngân hàng (nếu muốn chọn sẵn)
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
  private readonly vnpTmnCode = process.env.VNPAY_TMN_CODE!;
  private readonly vnpHashSecret = process.env.VNPAY_HASH_SECRET!;
  private readonly vnpUrl =
    process.env.VNPAY_URL ||
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly vnpApiUrl =
    process.env.VNPAY_API_URL ||
    'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

  /**
   * Sort object theo key và encode đúng format VNPay
   * Logic này giống hệt code mẫu của VNPay
   */
  private sortObject(obj: Record<string, any>): Record<string, any> {
    const sorted: Record<string, any> = {};
    const keys: string[] = [];

    // Lấy tất cả keys và encode
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        keys.push(encodeURIComponent(key));
      }
    }

    // Sort keys
    keys.sort();

    // Tạo object mới với keys đã sort và encode values
    for (const encodedKey of keys) {
      const originalKey = decodeURIComponent(encodedKey);
      const value = obj[originalKey] === null || obj[originalKey] === undefined
        ? ''
        : obj[originalKey];
      sorted[encodedKey] = encodeURIComponent(value).replace(/%20/g, '+');
    }

    return sorted;
  }

  /**
   * Tạo chữ ký đúng chuẩn VNPay (SHA512)
   * Logic này giống hệt code mẫu của VNPay
   */
  private createSecureHash(params: Record<string, any>): string {
    // Sort và encode object
    const sortedParams = this.sortObject(params);

    // Tạo query string từ sorted object (không encode thêm vì đã encode rồi)
    const signData = Object.keys(sortedParams)
      .map((key) => `${key}=${sortedParams[key]}`)
      .join('&');

    // Tạo hash SHA512
    const hmac = crypto.createHmac('sha512', this.vnpHashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return signed.toUpperCase();
  }

  // Tạo link thanh toán VNPay
  async createVNPayPayment(
    paymentData: VNPayPaymentRequest,
  ): Promise<VNPayPaymentResponse> {
    try {
      this.logger.debug(
        `[createVNPayPayment] Creating payment: orderId=${paymentData.orderId}, amount=${paymentData.amount}, returnUrl=${paymentData.returnUrl}, ip=${paymentData.ipAddr}`,
      );

      // Thời gian Việt Nam (GMT+7) - dùng moment.utcOffset(7) để đảm bảo đúng múi giờ
      const date = moment().utcOffset(7);
      const createDate = date.format('YYYYMMDDHHmmss');
      const expireDate = date.add(15, 'minutes').format('YYYYMMDDHHmmss');

      // VNPay yêu cầu amount nhân 100 và là string
      const vnpAmount = Math.round(paymentData.amount * 100).toString();

      // Làm sạch orderId (chỉ cho phép chữ, số, _, -)
      const vnpTxnRef = String(paymentData.orderId)
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 100);

      // Xử lý IP Address: VNPay Sandbox đôi khi lỗi với IPv6 (::1)
      let vnpIpAddr = paymentData.ipAddr || '127.0.0.1';
      if (vnpIpAddr === '::1') {
        vnpIpAddr = '127.0.0.1';
      }
      // Chỉ lấy IPv4 đầu tiên nếu có list
      if (vnpIpAddr.includes(',')) {
        vnpIpAddr = vnpIpAddr.split(',')[0].trim();
      }

      // Params chính thức gửi sang VNPay
      const vnpParams: Record<string, any> = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: this.vnpTmnCode,
        vnp_Amount: vnpAmount,
        vnp_CurrCode: 'VND',
        vnp_TxnRef: vnpTxnRef,
        vnp_OrderInfo: (
          paymentData.orderInfo || 'Thanh toan don hang'
        ).substring(0, 255),
        vnp_OrderType: 'other', // hoặc 250001 cho topping up, xem tài liệu VNPay
        vnp_Locale: paymentData.locale || 'vn',
        vnp_ReturnUrl: paymentData.returnUrl, // bắt buộc https:// trên production
        vnp_IpAddr: vnpIpAddr.substring(0, 45),
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate,
      };

      // THÊM MỚI: nếu có chọn ngân hàng thì thêm
      if (paymentData.bankCode) {
        vnpParams.vnp_BankCode = paymentData.bankCode;
      }

      // Sort params để tạo query string (giống code mẫu)
      const sortedParams = this.sortObject(vnpParams);

      // Tạo query string từ sorted object (không encode thêm vì đã encode rồi)
      const signData = Object.keys(sortedParams)
        .map((key) => `${key}=${sortedParams[key]}`)
        .join('&');

      // Log chuỗi cần ký để debug (QUAN TRỌNG: kiểm tra log này nếu lỗi Checksum)
      this.logger.debug(`[createVNPayPayment] Sign Data: ${signData}`);

      // Tạo hash SHA512
      const hmac = crypto.createHmac('sha512', this.vnpHashSecret);
      const secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex').toUpperCase();

      sortedParams['vnp_SecureHash'] = secureHash;

      // Tạo query string từ sorted params (đã encode sẵn)
      const queryString = Object.keys(sortedParams)
        .map((key) => `${key}=${sortedParams[key]}`)
        .join('&');

      const paymentUrl = `${this.vnpUrl}?${queryString}`;

      // Log để debug (ẩn bớt thông tin nhạy cảm)
      this.logger.debug(
        `[createVNPayPayment] Generated VNPay URL (trimmed): ${paymentUrl.substring(
          0,
          200,
        )}...`,
      );

      return {
        vnpUrl: paymentUrl,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
      };
    } catch (error) {
      this.logger.error(
        `[createVNPayPayment] Failed to create VNPay payment for ${paymentData.orderId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException('Không thể tạo link thanh toán VNPay');
    }
  }

  /**
   * Xác minh chữ ký trả về từ VNPay (return URL hoặc IPN)
   * Logic này giống hệt code mẫu của VNPay
   */
  verifyVNPaySignature(vnpParams: Record<string, any>): boolean {
    try {
      const receivedHash = vnpParams.vnp_SecureHash;
      if (!receivedHash) {
        this.logger.warn('[verifyVNPaySignature] Missing vnp_SecureHash');
        return false;
      }

      // Copy và xóa hash khỏi params (giống code mẫu)
      const params = { ...vnpParams };
      delete params.vnp_SecureHash;
      delete params.vnp_SecureHashType; // nếu có

      // Tính toán hash từ params (dùng cùng logic như khi tạo)
      const calculatedHash = this.createSecureHash(params);

      const isValid = receivedHash.toUpperCase() === calculatedHash.toUpperCase();

      this.logger.debug(
        `[verifyVNPaySignature] TxnRef=${vnpParams.vnp_TxnRef} | ResponseCode=${vnpParams.vnp_ResponseCode} | Valid=${isValid}`,
      );

      if (!isValid) {
        this.logger.warn(
          `[verifyVNPaySignature] Hash mismatch! Received: ${receivedHash.substring(0, 20)}... | Calculated: ${calculatedHash.substring(0, 20)}...`,
        );
      }

      return isValid;
    } catch (error) {
      this.logger.error(
        `[verifyVNPaySignature] Error verifying signature for TxnRef=${vnpParams.vnp_TxnRef}`,
        error instanceof Error ? error.stack : undefined,
      );
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
