import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as nodeCrypto from 'node:crypto';
import { Transport } from '@nestjs/microservices';

// Ensure global crypto exists for dependencies that expect it (e.g., @nestjs/schedule)
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = nodeCrypto;
} else if (!(globalThis as any).crypto.randomUUID) {
  (globalThis as any).crypto.randomUUID = nodeCrypto.randomUUID;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue: process.env.RABBITMQ_QUEUE || 'payment_worker_queue',
      queueOptions: {
        durable: true,
      },
      noAck: true,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3006);
  console.log(`Payment service is running on port ${process.env.PORT ?? 3006}`);
}
bootstrap();
