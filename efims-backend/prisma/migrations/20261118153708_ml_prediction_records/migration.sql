-- CreateEnum
CREATE TYPE "MlPredictionCapability" AS ENUM ('SEVERITY', 'ANOMALY', 'RECOVERY');

-- CreateEnum
CREATE TYPE "MlPredictionDecision" AS ENUM ('PENDING', 'ACCEPTED', 'OVERRIDDEN');

-- CreateTable
CREATE TABLE "ml_prediction_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "capability" "MlPredictionCapability" NOT NULL,
    "predictionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "decision" "MlPredictionDecision" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_prediction_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ml_prediction_records_tenantId_entityType_entityId_idx" ON "ml_prediction_records"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ml_prediction_records_tenantId_decision_idx" ON "ml_prediction_records"("tenantId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "ml_prediction_records_tenantId_predictionId_key" ON "ml_prediction_records"("tenantId", "predictionId");

-- AddForeignKey
ALTER TABLE "ml_prediction_records" ADD CONSTRAINT "ml_prediction_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
