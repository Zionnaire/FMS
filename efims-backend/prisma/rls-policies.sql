-- EFIMS — Row-Level Security policies (docs/architecture.md §4.2, CLAUDE.md non-negotiable #5)
--
-- Run this AFTER the schema has been migrated (`npm run prisma:migrate:dev`), against the same
-- database, as a role that can CREATE ROLE / GRANT (i.e. the Postgres superuser, not efims_app):
--
--   npm run db:rls
--
-- Idempotent — safe to re-run. It is intentionally a plain SQL script rather than a Prisma
-- migration: Prisma's schema DSL has no representation for RLS policies or non-owner roles, so
-- letting Prisma "own" this file would just mean hand-editing generated SQL anyway.
--
-- Why a dedicated role matters: table owners and superusers BYPASS row-level security policies
-- by default, no matter how many CREATE POLICY statements exist. If the app connects as the
-- same role that ran the migrations (commonly the table owner), RLS silently does nothing. This
-- script creates `efims_app` — a non-superuser role the app actually connects as — and adds
-- FORCE ROW LEVEL SECURITY so policies apply even if `efims_app` ever ends up owning a table.

-- The literal password below is a bootstrap placeholder only — change it immediately after
-- this script runs (`ALTER ROLE efims_app PASSWORD '<new>'`), then update DATABASE_URL to
-- match. It's intentionally more than "changeme" because hosted providers (Neon included)
-- reject weak passwords outright at role-creation time, not just as an application-level
-- opinion — this needs to pass that bar even as a placeholder.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'efims_app') THEN
    CREATE ROLE efims_app LOGIN PASSWORD 'Ch4ngeMe-Before-Real-Use!' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- Grants: full CRUD on tenant-scoped identity tables...
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users,
  user_compartment_grants,
  teams,
  team_memberships,
  refresh_tokens
TO efims_app;

-- configuration_entries never gets DELETE (version history is kept forever — superseded rows
-- stay as a record of what used to be ratified, not removed) but does need UPDATE for the
-- ratification transition (status/ratifiedBy/ratifiedAt/effectiveDate on an existing row). The
-- "never mutate `value` after creation" rule is enforced by ConfigurationService, not this
-- grant — see the comment on the model in schema.prisma for why that one can't be a DB grant.
GRANT SELECT, INSERT, UPDATE ON configuration_entries TO efims_app;
REVOKE DELETE ON configuration_entries FROM efims_app;

-- incidents module: full CRUD except signals/incidents are never hard-deleted (rejection/merge
-- are status transitions, not row removal — the record of "this was reported and rejected/
-- merged" is itself part of the audit trail). whistleblower_identity_vault also has no DELETE:
-- non-negotiable #7's separation only means something if the vault can't be quietly emptied
-- out from under an active whistleblower protection.
GRANT SELECT, INSERT, UPDATE ON signals, incidents, incident_relations, whistleblower_identity_vault TO efims_app;
REVOKE DELETE ON signals, incidents, whistleblower_identity_vault FROM efims_app;
-- incident_relations DOES allow DELETE — unlinking two incidents that were related in error is
-- a legitimate correction, unlike erasing that a signal/incident/vault entry ever existed.
GRANT DELETE ON incident_relations TO efims_app;

-- triage module: triage_assessments is pure append-only history (see the model's own doc
-- comment — every assessment/escalation is a new row, never mutated or removed), so no UPDATE
-- and no DELETE at all, stricter even than configuration_entries.
GRANT SELECT, INSERT ON triage_assessments TO efims_app;
REVOKE UPDATE, DELETE ON triage_assessments FROM efims_app;

-- cases module: case records get the same "never hard-deleted" treatment as incidents (status
-- transitions, not row removal). case_status_history is pure append-only like
-- triage_assessments. case_user_flags DOES allow DELETE — it's an access-control mechanism (a
-- declared conflict or subject can be cleared), not a historical record; see its own doc
-- comment in schema.prisma for why that's a deliberate difference from the other two.
GRANT SELECT, INSERT, UPDATE ON cases TO efims_app;
REVOKE DELETE ON cases FROM efims_app;
GRANT SELECT, INSERT, DELETE ON case_user_flags TO efims_app;
REVOKE UPDATE ON case_user_flags FROM efims_app;
GRANT SELECT, INSERT ON case_status_history TO efims_app;
REVOKE UPDATE, DELETE ON case_status_history FROM efims_app;

-- workflow module: sla_clocks needs UPDATE (pause/resume/stop mutate the same row — see the
-- model's own doc comment on why there's no separate pause-history table), no DELETE (a clock's
-- existence is itself part of the record, same "never hard-deleted" posture as incidents/cases).
-- approval_requests needs UPDATE for the same reason (decide() mutates status/decidedBy/
-- decidedAt/decisionNotes on the same row, matching configuration_entries' ratify pattern), no
-- DELETE (a rejected request stays as a record that it was requested and rejected).
GRANT SELECT, INSERT, UPDATE ON sla_clocks TO efims_app;
REVOKE DELETE ON sla_clocks FROM efims_app;
GRANT SELECT, INSERT, UPDATE ON approval_requests TO efims_app;
REVOKE DELETE ON approval_requests FROM efims_app;

-- notifications module: notifications needs UPDATE (markRead sets readAt on the same row), no
-- DELETE (no "clear notification" feature at MVP — see the module's own README section).
-- notification_deliveries is INSERT-only besides SELECT: each row is one immutable delivery
-- attempt, written once by NotificationsService.deliverExternal and never mutated afterward.
GRANT SELECT, INSERT, UPDATE ON notifications TO efims_app;
REVOKE DELETE ON notifications FROM efims_app;
GRANT SELECT, INSERT ON notification_deliveries TO efims_app;
REVOKE UPDATE, DELETE ON notification_deliveries FROM efims_app;
-- push_subscriptions: full CRUD except there's no meaningful "update" beyond re-subscribing
-- (upsert-by-endpoint, i.e. delete+insert or insert-on-conflict), and DELETE is a real operation
-- (unsubscribe, or NotificationsService cleaning up a stale endpoint after the push service
-- itself reports it gone with a 404/410).
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO efims_app;

-- investigations module: investigation_plans is versioned/append-only like
-- configuration_entries/triage_assessments (a new plan revision is a new row, never mutated) —
-- no UPDATE, no DELETE. investigation_issues needs UPDATE (resolve() mutates status/resolution/
-- resolvedBy/resolvedAt on the same row), no DELETE. interviews/findings are pure historical
-- records — SELECT/INSERT only, same as audit_events' posture but without the hash chain (no
-- tamper-evidence requirement was stated for these, unlike the audit ledger itself).
GRANT SELECT, INSERT ON investigation_plans TO efims_app;
REVOKE UPDATE, DELETE ON investigation_plans FROM efims_app;
GRANT SELECT, INSERT, UPDATE ON investigation_issues TO efims_app;
REVOKE DELETE ON investigation_issues FROM efims_app;
GRANT SELECT, INSERT ON interviews TO efims_app;
REVOKE UPDATE, DELETE ON interviews FROM efims_app;
GRANT SELECT, INSERT ON findings TO efims_app;
REVOKE UPDATE, DELETE ON findings FROM efims_app;

-- evidence module: evidence_items keeps the same "never hard-deleted" posture as incidents/cases.
-- EVD-02 (fixed 2026-11-25): UPDATE is now column-restricted to exactly the 4 legal-hold fields
-- `EvidenceService.toggleLegalHold` actually writes — confirmed by grepping every
-- `evidenceItem.update` call in the codebase before writing this grant; there is exactly one, and
-- it only ever touches these columns. Every other column, `contentHash` above all (this module's
-- entire reason for existing — "never recomputed except by an explicit `.../verify` call, and
-- never mutated once set", per its own schema doc comment), is write-once at ingest and was
-- previously protected only by the application never happening to call `.update()` on it — the
-- same "enforced at the application layer, not by this grant" caveat `configuration_entries.value`
-- still carries below (not fixed in this pass; same treatment would apply there too). This is the
-- first column-restricted grant in this file. custody_events is pure append-only like
-- interviews/findings — SELECT/INSERT only.
GRANT SELECT, INSERT ON evidence_items TO efims_app;
-- Explicit REVOKE first: GRANT is additive, so re-running this script after an earlier session
-- already ran the old blanket `GRANT ... UPDATE ON evidence_items` would otherwise leave that
-- broader table-level grant in place alongside the new column-level one below, silently
-- defeating the whole point of this fix — caught live, the column-level grant alone did NOT
-- remove the preexisting blanket one (confirmed via `\dp evidence_items` still showing table-level
-- `w` for efims_app after the first apply attempt).
REVOKE UPDATE ON evidence_items FROM efims_app;
GRANT UPDATE ("legalHold", "legalHoldReason", "legalHoldSetBy", "legalHoldSetAt") ON evidence_items TO efims_app;
REVOKE DELETE ON evidence_items FROM efims_app;
GRANT SELECT, INSERT ON custody_events TO efims_app;
REVOKE UPDATE, DELETE ON custody_events FROM efims_app;

-- containment module: containment_requests needs UPDATE (confirm/reject/cancel mutate status/
-- confirmedAt/rejectedAt/cancelledAt on the same row, same pattern as approval_requests/
-- sla_clocks), no DELETE — a containment request and how the source system responded to it is
-- itself part of the case file, never erased.
GRANT SELECT, INSERT, UPDATE ON containment_requests TO efims_app;
REVOKE DELETE ON containment_requests FROM efims_app;

-- recovery module: loss_entries/recovery_entries/write_off_entries are all pure append-only
-- ledger rows, same posture as interviews/findings — a loss/recovery/write-off determination is
-- a fact-of-record; correcting one means recording a new entry, never mutating history.
GRANT SELECT, INSERT ON loss_entries TO efims_app;
REVOKE UPDATE, DELETE ON loss_entries FROM efims_app;
GRANT SELECT, INSERT ON recovery_entries TO efims_app;
REVOKE UPDATE, DELETE ON recovery_entries FROM efims_app;
GRANT SELECT, INSERT ON write_off_entries TO efims_app;
REVOKE UPDATE, DELETE ON write_off_entries FROM efims_app;

-- capa module: root_cause_analyses is versioned/append-only like investigation_plans (no UPDATE,
-- no DELETE). capa_actions needs UPDATE (start/complete/cancel/validate-triggered-reopen mutate
-- status/completionNotes/completedAt/cancellationReason/cancelledAt on the same row, same
-- pattern as investigation_issues), no DELETE. capa_validations is pure append-only like
-- interviews/findings.
GRANT SELECT, INSERT ON root_cause_analyses TO efims_app;
REVOKE UPDATE, DELETE ON root_cause_analyses FROM efims_app;
GRANT SELECT, INSERT, UPDATE ON capa_actions TO efims_app;
REVOKE DELETE ON capa_actions FROM efims_app;
GRANT SELECT, INSERT ON capa_validations TO efims_app;
REVOKE UPDATE, DELETE ON capa_validations FROM efims_app;

-- regulatory module: regulatory_obligations needs UPDATE (submit/acknowledge/waive mutate
-- status/acknowledgedRef/acknowledgedAt/waivedReason/waivedBy/waivedAt on the same row, same
-- pattern as capa_actions/approval_requests), no DELETE. regulatory_submissions is pure
-- append-only like write_off_entries.
GRANT SELECT, INSERT, UPDATE ON regulatory_obligations TO efims_app;
REVOKE DELETE ON regulatory_obligations FROM efims_app;

-- tasks module: a freestanding to-do needs UPDATE (complete/cancel mutate status/completedAt/
-- cancelledReason/cancelledAt on the same row, same pattern as capa_actions), no DELETE —
-- cancelling a task is a status transition, not row removal, same reasoning as every other
-- "never hard-delete, always transition status" table in this file.
GRANT SELECT, INSERT, UPDATE ON tasks TO efims_app;
REVOKE DELETE ON tasks FROM efims_app;
GRANT SELECT, INSERT ON regulatory_submissions TO efims_app;
REVOKE UPDATE, DELETE ON regulatory_submissions FROM efims_app;

-- ml-gateway module: ml_prediction_records needs UPDATE (decidePrediction() mutates decision/
-- decidedBy/decidedAt on the same row, same pattern as approval_requests/access_change_requests'
-- own decide()), no DELETE — a logged prediction and its eventual accept/override decision is a
-- retraining-data record, never erased, same "never hard-delete" posture as everything else here.
GRANT SELECT, INSERT, UPDATE ON ml_prediction_records TO efims_app;
REVOKE DELETE ON ml_prediction_records FROM efims_app;

-- ...but audit_events is append-only at the *database grant* level, not just in application
-- code — belt-and-suspenders for CLAUDE.md non-negotiable #6 ("no update/delete path exists,
-- including via raw SQL"). efims_app can INSERT and SELECT, nothing else.
GRANT SELECT, INSERT ON audit_events TO efims_app;
REVOKE UPDATE, DELETE ON audit_events FROM efims_app;

-- Found live 2026-11-25, verifying AUD-03: `AuditEvent.sequence` (added for AUD-01's chain-
-- ordering fix, same date) is a Postgres SERIAL-style column, which Postgres backs with its own
-- implicit sequence object (`audit_events_sequence_seq`) — a SEPARATE grantable object from the
-- `audit_events` table itself. The table-level INSERT grant above does NOT include permission to
-- advance that sequence; without this, every single audit write was failing outright with
-- `permission denied for sequence audit_events_sequence_seq` (`AuditService.record()`'s own
-- try/catch swallowed the error into a log line per its own design — "an audit write failing must
-- never take down the request that triggered it" — which is exactly why this went undetected
-- until a live check specifically went looking for the written events and found none). This is
-- the only sequence in the schema (every other model uses a UUID `@id`), so this one GRANT closes
-- the whole gap, not just this one column.
GRANT USAGE, SELECT ON SEQUENCE audit_events_sequence_seq TO efims_app;

-- access_change_requests (maker-checker for role/compartment changes, added 2026-10-14) follows
-- the exact same posture as approval_requests: UPDATE for decide() mutating status/decidedBy/
-- decidedAt/decisionNotes on the same row, no DELETE — a rejected access change stays as a record
-- that it was requested and rejected.
GRANT SELECT, INSERT, UPDATE ON access_change_requests TO efims_app;
REVOKE DELETE ON access_change_requests FROM efims_app;

-- entities module (added 2026-11-23): unlike `cases`/`incidents` (a permanent record that
-- something was reported/filed, even after closure), an `Entity` DOES allow DELETE — a
-- speculatively-created or duplicate party (e.g. while mapping out a network and realizing two
-- nodes are the same person) is a correctable mistake, not a historical record, the same
-- reasoning as `case_user_flags`' own DELETE grant. The audit trail (`entities.entity.delete`)
-- still permanently records that it happened even though the row itself is gone — same "the fact
-- of the action survives in audit_events regardless of what happens to the row" posture as
-- case_user_flags. `entity_identifiers`/`entity_risk_assessments` are pure append-only forensic
-- records, same posture as interviews/findings/triage_assessments — SELECT/INSERT only.
-- `entity_relationships`/`entity_case_links` also allow DELETE — a wrongly-drawn graph edge or a
-- case link made in error is a legitimate correction, the exact same reasoning as
-- incident_relations' own DELETE grant above, not a historical record to preserve.
GRANT SELECT, INSERT, UPDATE, DELETE ON entities TO efims_app;
GRANT SELECT, INSERT ON entity_identifiers TO efims_app;
REVOKE UPDATE, DELETE ON entity_identifiers FROM efims_app;
GRANT SELECT, INSERT, DELETE ON entity_relationships TO efims_app;
REVOKE UPDATE ON entity_relationships FROM efims_app;
GRANT SELECT, INSERT, DELETE ON entity_case_links TO efims_app;
REVOKE UPDATE ON entity_case_links FROM efims_app;
GRANT SELECT, INSERT ON entity_risk_assessments TO efims_app;
REVOKE UPDATE, DELETE ON entity_risk_assessments FROM efims_app;

-- The control-plane `tenants` table now gets INSERT/UPDATE too (added 2026-10-14): real tenant
-- provisioning (POST /platform/tenants) and suspend/reactivate (PATCH /platform/tenants/:id) are
-- now things the running app does, via the platform module — still no DELETE, a tenant is
-- suspended, never hard-deleted. `platform_users` is the same control-plane posture as `tenants`
-- itself (no tenantId column, not RLS-scoped — a platform login is cross-tenant by definition).
GRANT SELECT, INSERT, UPDATE ON tenants TO efims_app;
REVOKE DELETE ON tenants FROM efims_app;
GRANT SELECT, INSERT, UPDATE ON platform_users TO efims_app;
REVOKE DELETE ON platform_users FROM efims_app;

-- Sequences / default value generators, if any get added later, need USAGE too.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO efims_app;

-- ---------------------------------------------------------------------------------------------
-- Enable + force RLS on every tenant-scoped table, then add the single tenant-isolation policy.
-- ---------------------------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'user_compartment_grants', 'teams', 'team_memberships', 'refresh_tokens', 'audit_events', 'configuration_entries', 'signals', 'incidents', 'incident_relations', 'whistleblower_identity_vault', 'triage_assessments', 'cases', 'case_user_flags', 'case_status_history', 'sla_clocks', 'approval_requests', 'access_change_requests', 'notifications', 'notification_deliveries', 'push_subscriptions', 'investigation_plans', 'investigation_issues', 'interviews', 'findings', 'evidence_items', 'custody_events', 'containment_requests', 'loss_entries', 'recovery_entries', 'write_off_entries', 'root_cause_analyses', 'capa_actions', 'capa_validations', 'regulatory_obligations', 'regulatory_submissions', 'tasks', 'ml_prediction_records', 'entities', 'entity_identifiers', 'entity_relationships', 'entity_case_links', 'entity_risk_assessments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $pol$CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.current_tenant', true))
        WITH CHECK ("tenantId" = current_setting('app.current_tenant', true))$pol$,
      t
    );
  END LOOP;
END
$$;

-- `current_setting('app.current_tenant', true)` (the `true` = "missing_ok") returns NULL if no
-- request has set the session variable yet, rather than raising an error — so a stray query
-- outside any tenant-context transaction sees zero rows instead of crashing, which is the safer
-- failure mode for a security boundary. It is compared against `tenantId`, which is stored as
-- TEXT (Prisma's default @id String @default(uuid()) representation), so no ::uuid cast is
-- needed here — if the column type is ever changed to a native uuid type, add the cast back.
