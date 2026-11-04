-- CreateEnum
CREATE TYPE "LossCategory" AS ENUM ('PRINCIPAL', 'FEES', 'INTEREST', 'OTHER');

-- CreateEnum
CREATE TYPE "RecoveryMethod" AS ENUM ('CUSTOMER_REFUND_REVERSAL', 'INSURANCE_CLAIM', 'CHARGEBACK', 'THIRD_PARTY_RECOVERY', 'OTHER');

-- CreateTable
CREATE TABLE "loss_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category" "LossCategory" NOT NULL,
    "description" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "RecoveryMethod" NOT NULL,
    "description" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "write_off_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "justification" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "write_off_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loss_entries_tenantId_caseId_idx" ON "loss_entries"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "recovery_entries_tenantId_caseId_idx" ON "recovery_entries"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "write_off_entries_approvalId_key" ON "write_off_entries"("approvalId");

-- CreateIndex
CREATE INDEX "write_off_entries_tenantId_caseId_idx" ON "write_off_entries"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "loss_entries" ADD CONSTRAINT "loss_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_entries" ADD CONSTRAINT "loss_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_off_entries" ADD CONSTRAINT "write_off_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_off_entries" ADD CONSTRAINT "write_off_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
