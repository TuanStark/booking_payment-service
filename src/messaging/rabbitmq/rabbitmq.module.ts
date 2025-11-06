import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RabbitMQProducerService } from './rabbitmq.producer.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_CLIENT',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
            queue: configService.get<string>('RABBITMQ_QUEUE') || 'booking.payments',
            queueOptions: { durable: true },
            noAck: true,
            prefetchCount: 0,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [RabbitMQProducerService],
  exports: [RabbitMQProducerService],
})
export class RabbitMQModule {}