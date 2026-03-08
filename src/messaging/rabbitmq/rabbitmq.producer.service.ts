import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';

export interface PaymentEventData {
  paymentId: string;
  bookingId: string;
  amount: number;
  status: string;
  transactionId?: string;
  reference?: string;
}

@Injectable()
export class RabbitMQProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQProducerService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;

  private readonly exchange: string;
  private readonly queue: string;

  constructor(private readonly configService: ConfigService) {
    this.exchange = this.configService.get<string>('RABBITMQ_EXCHANGE') || 'booking_topic_exchange';
    this.queue = this.configService.get<string>('RABBITMQ_QUEUE') || 'payment_worker_queue';
  }

  async onModuleInit() {
    const url = this.configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672';
    this.connection = amqp.connect([url]);

    this.connection.on('connect', () => this.logger.log('Connected to RabbitMQ!'));
    this.connection.on('disconnect', err => this.logger.error('Disconnected from RabbitMQ.', err));

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        // 1. Assert Topic Exchange
        await channel.assertExchange(this.exchange, 'topic', { durable: true });

        // 2. Assert Queue
        await channel.assertQueue(this.queue, { durable: true });

        // 3. Bind Queue to Exchange with routing keys this service needs to listen to
        // Payment Service needs to listen to booking.created events
        await channel.bindQueue(this.queue, this.exchange, 'booking.created');

        this.logger.log(`RabbitMQ Topology Setup: Exchange=${this.exchange}, Queue=${this.queue}`);
      },
    });
  }

  async emitPaymentEvent(topic: string, data: PaymentEventData): Promise<void> {
    try {
      if (!this.channelWrapper) {
        throw new Error('RabbitMQ channel is not available');
      }

      const payload = {
        pattern: topic,
        data: data,
      };

      await this.channelWrapper.publish(this.exchange, topic, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
        contentType: 'application/json',
      } as any);

      this.logger.log(`✅ Payment event published to ${topic}: ${JSON.stringify(data)}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to publish payment event to ${topic}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async emitBookingEvent(topic: string, data: any): Promise<void> {
    try {
      if (!this.channelWrapper) {
        throw new Error('RabbitMQ channel is not available');
      }

      const payload = {
        pattern: topic,
        data: data,
      };

      await this.channelWrapper.publish(this.exchange, topic, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
        contentType: 'application/json',
      } as any);

      this.logger.log(`✅ Booking event published to ${topic}: ${JSON.stringify(data)}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to publish booking event to ${topic}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.channelWrapper) {
      await this.channelWrapper.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    this.logger.log('RabbitMQ connection closed');
  }
}
