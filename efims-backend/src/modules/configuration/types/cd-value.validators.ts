import { BadRequestException } from '@nestjs/common';
import { CdKey } from '@prisma/client';

/**
 * Structural validation for each CD's `value` payload — deliberately hand-rolled assertions
 * rather than 8 full class-validator DTO trees. The 8 shapes in cd-value.types.ts are quite
 * different and none of them are user-facing forms yet (nothing consumes these payloads outside
 * this module and the seed script) — this exists to catch an obviously-malformed payload at the
 * API boundary, not to be the final word on CD schema validation once `triage`/`cases` etc.
 * start actually reading these values and have real opinions about their shape.
 */
type Validator = (value: unknown) => void;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new BadRequestException(`Invalid configuration value: ${message}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const validators: Record<CdKey, Validator> = {
  [CdKey.CD_01_INCIDENT_TAXONOMY]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.categories), '"categories" must be an array');
    const categories = (v as { categories: unknown[] }).categories;
    for (const category of categories) {
      assert(isPlainObject(category) && typeof category.name === 'string', 'each category needs a string "name"');
      assert(Array.isArray((category as { types?: unknown }).types), 'each category needs a "types" array');
    }
  },
  [CdKey.CD_02_SEVERITY_THRESHOLDS]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.tiers), '"tiers" must be an array');
    const tiers = (v as { tiers: unknown[] }).tiers;
    assert(tiers.length === 4, 'severity thresholds must define exactly 4 tiers (S1-S4)');
    for (const tier of tiers) {
      assert(
        isPlainObject(tier) && ['S1', 'S2', 'S3', 'S4'].includes(tier.tier as string),
        'each tier needs "tier" set to one of S1/S2/S3/S4',
      );
    }
  },
  [CdKey.CD_03_SLA_CALENDARS]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.calendars), '"calendars" must be an array');
  },
  [CdKey.CD_04_APPROVAL_MATRIX]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.rows), '"rows" must be an array');
  },
  [CdKey.CD_05_RETENTION_SCHEDULE]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.classes), '"classes" must be an array');
  },
  [CdKey.CD_06_HISTORICAL_MIGRATION_SCOPE]: (v) => {
    assert(
      isPlainObject(v) && Array.isArray(v.inScope) && Array.isArray(v.outOfScope),
      '"inScope" and "outOfScope" must both be arrays',
    );
  },
  [CdKey.CD_07_RTO_RPO]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.tiers), '"tiers" must be an array');
  },
  [CdKey.CD_08_AI_USE_CASE_SCOPE]: (v) => {
    assert(isPlainObject(v) && Array.isArray(v.phases), '"phases" must be an array');
  },
};

export function validateCdValue(key: CdKey, value: unknown): void {
  validators[key](value);
}
