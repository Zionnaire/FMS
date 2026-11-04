-- CreateEnum
CREATE TYPE "InvestigationPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IntervieweeRole" AS ENUM ('SUBJECT', 'WITNESS', 'STAFF', 'CUSTOMER', 'OTHER');

-- CreateTable
CREATE TABLE "investigation_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "objectives" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "InvestigationPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_issues" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "raisedBy" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "investigation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "intervieweeName" TEXT NOT NULL,
    "intervieweeRole" "IntervieweeRole" NOT NULL,
    "intervieweeUserId" TEXT,
    "conductedBy" TEXT NOT NULL,
    "conductedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "resolvesIssueId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supportingEvidence" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investigation_plans_tenantId_caseId_idx" ON "investigation_plans"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_plans_tenantId_caseId_version_key" ON "investigation_plans"("tenantId", "caseId", "version");

-- CreateIndex
CREATE INDEX "investigation_issues_tenantId_caseId_idx" ON "investigation_issues"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "interviews_tenantId_caseId_idx" ON "interviews"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "findings_tenantId_caseId_idx" ON "findings"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "investigation_plans" ADD CONSTRAINT "investigation_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_plans" ADD CONSTRAINT "investigation_plans_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_issues" ADD CONSTRAINT "investigation_issues_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_issues" ADD CONSTRAINT "investigation_issues_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_resolvesIssueId_fkey" FOREIGN KEY ("resolvesIssueId") REFERENCES "investigation_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
