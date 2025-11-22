import { IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from './enum';
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

export class CreateVNPayPaymentDto {
  @IsString()
  orderId: string;

  @IsNumber()
  @Min(1000) // Minimum amount 1,000 VND
  amount: number;

  @IsString()
  orderInfo: string;

  @IsString()
  returnUrl: string;

  @IsString()
  ipAddr: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class VNPayCallbackDto {
  @IsString()
  vnp_TmnCode: string;

  @IsString()
  vnp_Amount: string;

  @IsString()
  vnp_BankCode: string;

  @IsString()
  vnp_BankTranNo: string;

  @IsString()
  vnp_CardType: string;

  @IsString()
  vnp_PayDate: string;

  @IsString()
  vnp_OrderInfo: string;

  @IsString()
  vnp_TransactionNo: string;

  @IsString()
  vnp_ResponseCode: string;

  @IsString()
  vnp_TransactionStatus: string;

  @IsString()
  vnp_TxnRef: string;

  @IsString()
  vnp_SecureHashType: string;

  @IsString()
  vnp_SecureHash: string;
}
