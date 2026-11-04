-- CreateEnum
CREATE TYPE "SeverityTier" AS ENUM ('S1', 'S2', 'S3', 'S4');

-- CreateTable
CREATE TABLE "triage_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "severity" "SeverityTier" NOT NULL,
    "slaCalendarName" TEXT NOT NULL,
    "assignedTeamId" TEXT,
    "rationale" TEXT NOT NULL,
    "previousAssessmentId" TEXT,
    "assessedBy" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "triage_assessments_tenantId_incidentId_idx" ON "triage_assessments"("tenantId", "incidentId");

-- AddForeignKey
ALTER TABLE "triage_assessments" ADD CONSTRAINT "triage_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_assessments" ADD CONSTRAINT "triage_assessments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_assessments" ADD CONSTRAINT "triage_assessments_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_assessments" ADD CONSTRAINT "triage_assessments_previousAssessmentId_fkey" FOREIGN KEY ("previousAssessmentId") REFERENCES "triage_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
