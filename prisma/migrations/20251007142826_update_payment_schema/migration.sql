/*
  Warnings:

  - You are about to drop the column `bookingId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `paymentUrl` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `qrImageUrl` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `payments` table. All the data in the column will be lost.
  - Added the required column `booking_id` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."payments_bookingId_idx";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "bookingId",
DROP COLUMN "createdAt",
DROP COLUMN "paymentUrl",
DROP COLUMN "qrImageUrl",
DROP COLUMN "transactionId",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "booking_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payment_date" TIMESTAMP(3),
ADD COLUMN     "payment_url" TEXT,
ADD COLUMN     "qr_image_url" TEXT,
ADD COLUMN     "transaction_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");
