/*
  Warnings:

  - You are about to drop the column `bankAccount` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `payment_date` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `transaction_id` on the `payments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "bankAccount",
DROP COLUMN "bankName",
DROP COLUMN "payment_date",
DROP COLUMN "transaction_id",
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "transactionId" TEXT;
