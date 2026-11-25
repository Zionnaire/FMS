-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "sequence" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "audit_events_tenantId_sequence_idx" ON "audit_events"("tenantId", "sequence");
