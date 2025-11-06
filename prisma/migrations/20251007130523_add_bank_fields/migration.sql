/*
  Warnings:

  - You are about to drop the column `paymentDate` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `payments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "paymentDate",
DROP COLUMN "transactionId",
ADD COLUMN     "bankAccount" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payment_date" TIMESTAMP(3),
ADD COLUMN     "qrImageUrl" TEXT,
ADD COLUMN     "transaction_id" TEXT;
