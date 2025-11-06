import { Module } from '@nestjs/common';
import { ExternalService } from './external.service';
import { RedisModule } from '../../messaging/redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [ExternalService],
  exports: [ExternalService],
})
export class ExternalModule {}

