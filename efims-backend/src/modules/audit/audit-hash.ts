import { createHash } from 'crypto';

export interface AuditHashInput {
  previousHash: string | null;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: string;
  metadata: unknown;
  createdAt: string;
}

/**
 * Recursively sorts object keys before serializing — deliberately NOT plain `JSON.stringify`.
 * `metadata` round-trips through Postgres JSONB, which does not preserve the key insertion
 * order a JS object had when it was first constructed; hashing the JS-side representation with
 * `JSON.stringify` at write time and the JSONB-read-back representation with `JSON.stringify` at
 * verify time could disagree on key order for the exact same logical value, producing a false
 * "tampered" result. Imposing our own canonical (sorted-key) order sidesteps that entirely,
 * since it doesn't depend on either JS's or Postgres's incidental ordering.
 *
 * `undefined` handling mirrors `JSON.stringify`'s own semantics exactly, not by accident —
 * caught live, the first time `AuditService.query` (whose metadata is an `AuditEventQuery` full
 * of optional, often-unset fields) ran through `verifyChain`: an object's `undefined`-valued
 * keys are silently dropped on the way into JSONB (same as plain `JSON.stringify` drops them),
 * so a naive `Object.keys()` walk that DOESN'T also drop them hashes a different, larger key set
 * at write time (before the DB round-trip) than at verify time (after it) — a real mismatch,
 * not a tampering false-positive, but indistinguishable from one until this function accounts
 * for it. Object keys with an `undefined` value are omitted entirely (object semantics); an
 * `undefined` array element or standalone value becomes the literal `null` (array/scalar
 * semantics) — deliberately different treatment for the two cases, matching `JSON.stringify`.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  // A live `Date` instance has no own enumerable properties (`Object.keys(new Date())` is `[]`),
  // so without this check it falls into the generic-object branch below and canonicalizes to the
  // empty object `{}` — completely losing the actual instant it represents. That's exactly what
  // happened at write time for `configuration.ratify`'s `effectiveDate` and
  // `regulatory.obligation.create`'s `deadline` (both pass a live Date straight into `metadata`,
  // not a pre-serialized string): the in-memory hash was computed over `{}`, but the value
  // written to Postgres JSONB — and read back on every later `verifyChain` — is the ISO string
  // `Date.prototype.toJSON()`/`JSON.stringify` would have produced. Recursing through the
  // string branch below makes both paths canonicalize identically, matching `JSON.stringify`'s
  // own behavior for a `Date` (which calls `.toISOString()` via `.toJSON()`) instead of
  // silently disagreeing with it. Found live via a broken hash chain — see `docs/CHANGELOG.md`'s
  // 2026-09-30 entry for the full incident writeup, including why the events written before this
  // fix stay permanently, deliberately unrepaired (non-negotiable #3: no rewriting audit rows,
  // not even to correct a hashing bug in the code that wrote them).
  if (value instanceof Date) {
    return canonicalize(value.toISOString());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** The one hash function both `AuditService.record` (at write time) and the one-time backfill
 * script use — never reimplemented in raw SQL for the backfill, specifically so the two can
 * never silently drift apart into two different "canonical" hashes for the same logical event. */
export function computeAuditEventHash(input: AuditHashInput): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}
