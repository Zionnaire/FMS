-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "customerImpactCount" INTEGER,
ADD COLUMN     "dataCompromise" BOOLEAN,
ADD COLUMN     "financialExposureNgn" DECIMAL(18,2),
ADD COLUMN     "insiderInvolvement" BOOLEAN,
ADD COLUMN     "ongoingThreat" BOOLEAN,
ADD COLUMN     "regulatoryRelevance" BOOLEAN,
ADD COLUMN     "reportedByType" TEXT;
