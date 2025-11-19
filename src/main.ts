import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as nodeCrypto from 'node:crypto';

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
  await app.listen(process.env.PORT ?? 3006);
  console.log(`Payment service is running on port ${process.env.PORT ?? 3006}`);
}
bootstrap();
