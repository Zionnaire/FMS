-- CreateEnum
CREATE TYPE "ObligationType" AS ENUM ('STR_SAR_FILING', 'REGULATOR_NOTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACKNOWLEDGED', 'WAIVED');

-- CreateTable
CREATE TABLE "regulatory_obligations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "obligationType" "ObligationType" NOT NULL,
    "description" TEXT NOT NULL,
    "regulatorName" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "identifiedBy" TEXT NOT NULL,
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedRef" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "waivedReason" TEXT,
    "waivedBy" TEXT,
    "waivedAt" TIMESTAMP(3),

    CONSTRAINT "regulatory_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regulatory_obligations_tenantId_caseId_idx" ON "regulatory_obligations"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_submissions_approvalId_key" ON "regulatory_submissions"("approvalId");

-- CreateIndex
CREATE INDEX "regulatory_submissions_tenantId_obligationId_idx" ON "regulatory_submissions"("tenantId", "obligationId");

-- AddForeignKey
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "regulatory_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
