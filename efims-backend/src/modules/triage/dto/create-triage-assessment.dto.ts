import { SeverityTier } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * Shared shape for both the initial assessment (`POST .../triage`) and every later escalation/
 * re-assessment (`POST .../triage/escalate`) — a full snapshot each time, not a partial patch,
 * matching the same "resupply the whole thing" pattern already used for ConfigurationEntry
 * versions. `rationale` is required on both: a severity/routing decision with no stated
 * reasoning is exactly what this system's audit-first posture exists to prevent.
 */
export class CreateTriageAssessmentDto {
  @IsEnum(SeverityTier)
  severity!: SeverityTier;

  /** One of the tenant's currently-configured CD-03 calendar names (e.g. "24x7",
   * "business_hours") — validated against live config by TriageService, not a hardcoded enum. */
  @IsString()
  slaCalendarName!: string;

  @IsOptional()
  @IsUUID()
  assignedTeamId?: string;

  @IsString()
  @MinLength(10)
  rationale!: string;
}
