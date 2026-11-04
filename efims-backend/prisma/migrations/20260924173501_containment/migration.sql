-- CreateEnum
CREATE TYPE "ContainmentActionType" AS ENUM ('FREEZE_ACCOUNT', 'BLOCK_CARD', 'SUSPEND_ACCESS', 'HOLD_TRANSACTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContainmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "containment_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "actionType" "ContainmentActionType" NOT NULL,
    "targetDescription" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "ContainmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmationRef" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "containment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "containment_requests_tenantId_caseId_idx" ON "containment_requests"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "containment_requests" ADD CONSTRAINT "containment_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containment_requests" ADD CONSTRAINT "containment_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
