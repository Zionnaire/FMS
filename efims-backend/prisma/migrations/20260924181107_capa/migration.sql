-- CreateEnum
CREATE TYPE "CapaActionType" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "CapaActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CapaValidationOutcome" AS ENUM ('EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE');

-- CreateTable
CREATE TABLE "root_cause_analyses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "analysisMethod" TEXT,
    "identifiedBy" TEXT NOT NULL,
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "root_cause_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capa_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "rootCauseId" TEXT,
    "type" "CapaActionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CapaActionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completionNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "capa_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capa_validations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "capaActionId" TEXT NOT NULL,
    "outcome" "CapaValidationOutcome" NOT NULL,
    "notes" TEXT,
    "validatedBy" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capa_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "root_cause_analyses_tenantId_caseId_idx" ON "root_cause_analyses"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "root_cause_analyses_tenantId_caseId_version_key" ON "root_cause_analyses"("tenantId", "caseId", "version");

-- CreateIndex
CREATE INDEX "capa_actions_tenantId_caseId_idx" ON "capa_actions"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "capa_actions_tenantId_ownerId_idx" ON "capa_actions"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "capa_validations_tenantId_capaActionId_idx" ON "capa_validations"("tenantId", "capaActionId");

-- AddForeignKey
ALTER TABLE "root_cause_analyses" ADD CONSTRAINT "root_cause_analyses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "root_cause_analyses" ADD CONSTRAINT "root_cause_analyses_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_rootCauseId_fkey" FOREIGN KEY ("rootCauseId") REFERENCES "root_cause_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_validations" ADD CONSTRAINT "capa_validations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa_validations" ADD CONSTRAINT "capa_validations_capaActionId_fkey" FOREIGN KEY ("capaActionId") REFERENCES "capa_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
