import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQProducerService } from './rabbitmq.producer.service';

@Module({
  imports: [ConfigModule],
  providers: [RabbitMQProducerService],
  exports: [RabbitMQProducerService],
})
export class RabbitMQModule { }
