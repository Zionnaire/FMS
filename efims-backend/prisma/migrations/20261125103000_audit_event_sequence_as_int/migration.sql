-- AlterTable
-- Narrowing `sequence` from BigInt (BIGSERIAL) to Int (SERIAL): no tenant will ever produce over
-- two billion audit events in this product's lifetime, and BigInt has no native JSON
-- representation, which crashed every route returning a raw AuditEvent (found and fixed before
-- this ever reached a real caller — see that field's doc comment in schema.prisma).
-- Existing values are small (low thousands) and fit comfortably in Int, so the cast is safe.
-- The underlying sequence (audit_events_sequence_seq) and its DEFAULT nextval(...) expression are
-- untouched — a bigint-returning sequence feeding an integer column is ordinary, supported
-- Postgres behavior, so there is nothing to recreate there.
ALTER TABLE "audit_events" ALTER COLUMN "sequence" TYPE INTEGER USING "sequence"::INTEGER;
