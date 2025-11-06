import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { PaymentsModule } from './payments/payments.module';
import { RabbitMQModule } from './messaging/rabbitmq/rabbitmq.module';
import { PrismaService } from './prisma/prisma.service';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailWatcherModule } from './email-watcher/email-watcher.module';


@Module({
  imports: [
    ConfigModule.forRoot({
    isGlobal: true,
  }),
  ScheduleModule.forRoot(),
  PrismaModule,
  PaymentsModule,
  RabbitMQModule,
  EmailWatcherModule,
],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
