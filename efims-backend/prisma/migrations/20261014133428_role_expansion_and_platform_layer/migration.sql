-- CreateEnum
CREATE TYPE "AccessChangeType" AS ENUM ('ROLE_CHANGE', 'GRANT_COMPARTMENT', 'REVOKE_COMPARTMENT');

-- CreateEnum
CREATE TYPE "AccessChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'INCIDENT_REPORTER';
ALTER TYPE "Role" ADD VALUE 'TRIAGE_ANALYST';
ALTER TYPE "Role" ADD VALUE 'EVIDENCE_CUSTODIAN';
ALTER TYPE "Role" ADD VALUE 'SECURITY_ANALYST';
ALTER TYPE "Role" ADD VALUE 'OPERATIONS_OFFICER';
ALTER TYPE "Role" ADD VALUE 'RECOVERY_OFFICER';
ALTER TYPE "Role" ADD VALUE 'CONTROL_OWNER';
ALTER TYPE "Role" ADD VALUE 'EFFECTIVENESS_REVIEWER';
ALTER TYPE "Role" ADD VALUE 'HR_REVIEWER';
ALTER TYPE "Role" ADD VALUE 'PROTECTED_DISCLOSURE_OFFICER';
ALTER TYPE "Role" ADD VALUE 'CONFIG_ADMIN';
ALTER TYPE "Role" ADD VALUE 'AUDITOR';

-- AlterTable
ALTER TABLE "user_compartment_grants" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_change_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "changeType" "AccessChangeType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AccessChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestNotes" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionNotes" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "access_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE INDEX "access_change_requests_tenantId_targetUserId_idx" ON "access_change_requests"("tenantId", "targetUserId");

-- AddForeignKey
ALTER TABLE "access_change_requests" ADD CONSTRAINT "access_change_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_change_requests" ADD CONSTRAINT "access_change_requests_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
