import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class VietqrProvider {
  private readonly logger = new Logger(VietqrProvider.name);
  // account and acqId from env
  private accountNo = process.env.VIETQR_ACCOUNT_NO || '0123456789';
  private acqId = process.env.VIETQR_ACQ_ID || '970418';
  private accountName = process.env.VIETQR_ACCOUNT_NAME || 'Dormitory Booking';

  async createPayment(opts: { amount: number; orderId: string; addInfo?: string }) {
    const url = `https://img.vietqr.io/image/${this.acqId}-${this.accountNo}-compact2.jpg`;
    
    const shortOrderId = opts.orderId.substring(0, 8);
    const addInfo = opts.addInfo ?? `BOOKING_${shortOrderId}`;
    
    const params = new URLSearchParams({
      accountName: this.accountName,
      amount: opts.amount.toString(),
      addInfo,
      format: 'jpg',
    });
    const qrImageUrl = `${url}?${params.toString()}`;
    
    const paymentUrl = `vietqr://transfer?accountNo=${this.accountNo}&acqId=${this.acqId}&amount=${opts.amount}&addInfo=${encodeURIComponent(addInfo)}`;
    
    this.logger.log(`VietQR generated for order ${opts.orderId} (ref: ${shortOrderId})`);
    return { 
      qrImageUrl, 
      paymentUrl,
      reference: addInfo
    };
  }

  // With public VietQR there is no webhook; verification handled externally (IMAP / bank API)
  async verifyPayment(_: any) {
    return false;
  }
}
