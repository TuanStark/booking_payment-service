import { PaymentMethod, PaymentStatus } from "@prisma/client";

export interface CreatePaymentDto {
  bookingId: string;
  amount: number;
}

export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  provider: string;
  status: PaymentStatus;
  metadata: Record<string, unknown>;
  paymentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
