import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @IsString()
  @Type(() => String)
  bookingId: string;

  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsString()
  @Type(() => String)
  @IsOptional()
  status?: PaymentStatus;

  @IsString()
  @Type(() => String)
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @Type(() => String)
  userId: string;

  @IsString()
  @Type(() => String)
  @IsOptional()
  transactionId?: string;

  @IsString()
  @Type(() => String)
  @IsOptional()
  qrImageUrl?: string;

  @IsString()
  @Type(() => String)
  @IsOptional()
  paymentUrl?: string;

  @IsString()
  @Type(() => String)
  @IsOptional()
  reference?: string;
}

export class VerifyPaymentDto {
  @IsOptional()
  @IsString()
  transactionId?: string;
}