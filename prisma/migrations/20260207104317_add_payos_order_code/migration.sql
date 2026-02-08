-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'ZALOPAY';
ALTER TYPE "PaymentMethod" ADD VALUE 'MOMO';
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYOS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "order_code" BIGINT,
ADD COLUMN     "provider_data" JSONB;

-- CreateTable
CREATE TABLE "payment_details" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "recurring_token" TEXT,
    "frequency" TEXT,
    "next_charge_date" TIMESTAMP(3),
    "subs_plan_id" TEXT,
    "refund_amount" DOUBLE PRECISION,
    "refund_date" TIMESTAMP(3),
    "refund_reason" TEXT,
    "extra_metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_details_payment_id_key" ON "payment_details"("payment_id");

-- CreateIndex
CREATE INDEX "payment_details_payment_id_idx" ON "payment_details"("payment_id");

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");

-- AddForeignKey
ALTER TABLE "payment_details" ADD CONSTRAINT "payment_details_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
