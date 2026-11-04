-- CreateEnum
CREATE TYPE "SlaClockStatus" AS ENUM ('RUNNING', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "SeverityBand" AS ENUM ('S1_S2', 'S3_S4');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('CONTAINMENT', 'LOSS_WRITE_OFF', 'REGULATORY_SUBMISSION', 'CASE_CLOSURE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "sla_clocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "calendarName" TEXT NOT NULL,
    "targetDeadline" TIMESTAMP(3) NOT NULL,
    "status" "SlaClockStatus" NOT NULL DEFAULT 'RUNNING',
    "startedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedBy" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "totalPausedMinutes" INTEGER NOT NULL DEFAULT 0,
    "stoppedBy" TEXT,
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "sla_clocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "severityBand" "SeverityBand" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestNotes" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionNotes" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sla_clocks_tenantId_incidentId_idx" ON "sla_clocks"("tenantId", "incidentId");

-- CreateIndex
CREATE INDEX "approval_requests_tenantId_caseId_idx" ON "approval_requests"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
