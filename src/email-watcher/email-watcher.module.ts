// src/common/mail/email-watcher.module.ts
import { Module } from '@nestjs/common';
import { EmailWatcherService } from './email-watcher.service';
import { EmailWatcherCron } from './email-watcher.cron';
import { PaymentsModule } from '../payments/payments.module';
import { RabbitMQModule } from 'src/messaging/rabbitmq/rabbitmq.module';

@Module({
  imports: [PaymentsModule, RabbitMQModule],
  providers: [EmailWatcherService, EmailWatcherCron],
})
export class EmailWatcherModule {}
