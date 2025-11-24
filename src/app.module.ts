import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { PaymentsModule } from './payments/payments.module';
import { RabbitMQModule } from './messaging/rabbitmq/rabbitmq.module';
import { PrismaService } from './prisma/prisma.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    PaymentsModule,
    RabbitMQModule,
  ],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule { }
