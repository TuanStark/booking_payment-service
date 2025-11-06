/*
  Warnings:

  - The `status` column on the `payments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `method` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VIETQR', 'VNPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "method",
ADD COLUMN     "method" "PaymentMethod" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
