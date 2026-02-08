import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VietqrProvider } from './provider/vietqr.provider';
import { RabbitMQModule } from 'src/messaging/rabbitmq/rabbitmq.module';
import { RabbitMQConsumerController } from '../messaging/rabbitmq/rabbitmq.consumer';
import { ExternalModule } from '../common/external/external.module';
import { PaymentVNPayProvider } from './provider/vnpay.provider';
import { PaymentMomoProvider } from './provider/momo.provider';
import { PayosProvider } from './provider/payos.provider';

@Module({
  imports: [forwardRef(() => RabbitMQModule), ExternalModule, HttpModule],
  controllers: [PaymentsController, RabbitMQConsumerController],
  providers: [
    PaymentsService,
    VietqrProvider,
    PaymentVNPayProvider,
    PaymentMomoProvider,
    PayosProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule { }
