import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VietqrProvider } from './provider/vietqr.provider';
import { EmailWatcherService } from '../email-watcher/email-watcher.service';
import { RabbitMQModule } from 'src/messaging/rabbitmq/rabbitmq.module';
import { RabbitMQConsumerController } from '../messaging/rabbitmq/rabbitmq.consumer';
import { ExternalModule } from '../common/external/external.module';
import { PaymentVNPayProvider } from './provider/vnpay.provider';

@Module({
  imports: [forwardRef(() => RabbitMQModule), ExternalModule],
  controllers: [PaymentsController, RabbitMQConsumerController],
  providers: [PaymentsService, VietqrProvider, PaymentVNPayProvider, EmailWatcherService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
