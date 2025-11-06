// src/common/mail/email-watcher.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailWatcherService } from './email-watcher.service';

@Injectable()
export class EmailWatcherCron {
  private readonly logger = new Logger(EmailWatcherCron.name);

  constructor(private readonly emailWatcherService: EmailWatcherService) {}

  // Chạy mỗi phút
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    this.logger.log('🕐 Checking for new payment emails...');
    await this.emailWatcherService.checkNewTransactions();
  }
}
