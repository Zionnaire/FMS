-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM ('DOCUMENT', 'SCREENSHOT', 'TRANSACTION_RECORD', 'SYSTEM_LOG', 'STATEMENT', 'COMMUNICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CustodyAction" AS ENUM ('COLLECTED', 'VIEWED', 'EXPORTED', 'TRANSFERRED', 'HASH_VERIFIED');

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" "EvidenceCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "externalRef" TEXT,
    "sourceSystem" TEXT,
    "contentHash" TEXT NOT NULL,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "legalHoldReason" TEXT,
    "legalHoldSetBy" TEXT,
    "legalHoldSetAt" TIMESTAMP(3),
    "collectedBy" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evidenceItemId" TEXT NOT NULL,
    "action" "CustodyAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "relatedUserId" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_items_tenantId_caseId_idx" ON "evidence_items"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "custody_events_tenantId_evidenceItemId_idx" ON "custody_events"("tenantId", "evidenceItemId");

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_events" ADD CONSTRAINT "custody_events_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "evidence_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
