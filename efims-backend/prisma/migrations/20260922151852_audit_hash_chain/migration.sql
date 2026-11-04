/*
  Warnings:

  - Made the column `tenantId` on table `audit_events` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_tenantId_fkey";

-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "previousHash" TEXT,
ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "audit_events_tenantId_createdAt_idx" ON "audit_events"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
