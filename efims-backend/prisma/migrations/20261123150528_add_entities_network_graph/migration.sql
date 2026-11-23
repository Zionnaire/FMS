-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'COMPANY', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "EntityIdentifierType" AS ENUM ('BVN', 'NIN', 'RC_NUMBER', 'TIN', 'ACCOUNT_NUMBER', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityRelationshipType" AS ENUM ('BENEFICIAL_OWNER', 'KINSHIP', 'SIGNATORY', 'ASSOCIATE', 'CONTROLS', 'TRANSACTED_WITH', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityCaseLinkRole" AS ENUM ('SUBJECT', 'BENEFICIARY', 'COUNTERPARTY', 'WITNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityRiskAssessmentSource" AS ENUM ('MANUAL', 'ML_SUGGESTED');

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "watchlisted" BOOLEAN NOT NULL DEFAULT false,
    "watchlistReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_identifiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "EntityIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_relationships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "relationshipType" "EntityRelationshipType" NOT NULL,
    "rationale" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_case_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" "EntityCaseLinkRole" NOT NULL,
    "linkedBy" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_case_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_risk_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "band" "SeverityTier" NOT NULL,
    "factors" JSONB NOT NULL,
    "source" "EntityRiskAssessmentSource" NOT NULL DEFAULT 'MANUAL',
    "previousAssessmentId" TEXT,
    "assessedBy" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entities_tenantId_type_idx" ON "entities"("tenantId", "type");

-- CreateIndex
CREATE INDEX "entities_tenantId_watchlisted_idx" ON "entities"("tenantId", "watchlisted");

-- CreateIndex
CREATE INDEX "entity_identifiers_tenantId_entityId_idx" ON "entity_identifiers"("tenantId", "entityId");

-- CreateIndex
CREATE INDEX "entity_relationships_tenantId_fromEntityId_idx" ON "entity_relationships"("tenantId", "fromEntityId");

-- CreateIndex
CREATE INDEX "entity_relationships_tenantId_toEntityId_idx" ON "entity_relationships"("tenantId", "toEntityId");

-- CreateIndex
CREATE INDEX "entity_case_links_tenantId_caseId_idx" ON "entity_case_links"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "entity_case_links_entityId_caseId_key" ON "entity_case_links"("entityId", "caseId");

-- CreateIndex
CREATE INDEX "entity_risk_assessments_tenantId_entityId_idx" ON "entity_risk_assessments"("tenantId", "entityId");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_identifiers" ADD CONSTRAINT "entity_identifiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_identifiers" ADD CONSTRAINT "entity_identifiers_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_case_links" ADD CONSTRAINT "entity_case_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_case_links" ADD CONSTRAINT "entity_case_links_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_risk_assessments" ADD CONSTRAINT "entity_risk_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_risk_assessments" ADD CONSTRAINT "entity_risk_assessments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_risk_assessments" ADD CONSTRAINT "entity_risk_assessments_previousAssessmentId_fkey" FOREIGN KEY ("previousAssessmentId") REFERENCES "entity_risk_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
