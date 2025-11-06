// src/common/mail/email-watcher.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class EmailWatcherService {
  private readonly logger = new Logger(EmailWatcherService.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /** Tạo client IMAP mới */
  private createImapClient(): ImapFlow {
    return new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: Number(process.env.IMAP_PORT || 993),
      secure: true,
      auth: {
        user: process.env.IMAP_USER || '',
        pass: process.env.IMAP_PASS || '',
      },
    });
  }

  /** Kiểm tra mail mới */
  async checkNewTransactions(): Promise<void> {
    const client = this.createImapClient();
    
    try {
      await client.connect();
      this.logger.log('✅ Connected to IMAP server');
      await client.mailboxOpen('INBOX');

      // Lấy 10 mail gần nhất
      const messages = await client.fetch('*:*', {
        envelope: true,
        source: true,
      });

      for await (const msg of messages) {
        const parsed = await simpleParser(msg.source);
        const body = parsed.text || '';

        // Kiểm tra có mã booking không (hỗ trợ cả UUID đầy đủ và short reference)
        const fullMatch = body.match(/BOOKING_([a-f0-9-]{36})/i); // Full UUID
        const shortMatch = body.match(/BOOKING_([a-f0-9]{8})/i); // Short reference
        
        if (fullMatch || shortMatch) {
          const reference = fullMatch ? fullMatch[1] : shortMatch[1];
          const amountMatch = body.match(/(\d[\d.,]*)\s?VND/);
          const amount = amountMatch ? parseInt(amountMatch[1].replace(/[.,]/g, '')) : null;

          this.logger.log(`📩 Found payment email for BOOKING_${reference}, amount=${amount}`);

          if (amount !== null) {
            // Tìm payment bằng reference
            const payment = await this.paymentsService.findPaymentByReference(`BOOKING_${reference}`);
            if (payment) {
              await this.paymentsService.verifyPaymentFromEmail({
                bookingId: payment.bookingId,
                amount,
                rawMessage: body,
              });
            } else {
              this.logger.warn(`No payment found for reference BOOKING_${reference}`);
            }
          }
        }
      }

      await client.logout();
    } catch (err) {
      this.logger.error('Error while reading IMAP emails:', err.message);
      try {
        await client.logout();
      } catch (logoutErr) {
        // Ignore logout errors
      }
    }
  }
}
