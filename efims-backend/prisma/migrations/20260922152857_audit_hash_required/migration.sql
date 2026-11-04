/*
  Warnings:

  - Made the column `hash` on table `audit_events` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "audit_events" ALTER COLUMN "hash" SET NOT NULL;
