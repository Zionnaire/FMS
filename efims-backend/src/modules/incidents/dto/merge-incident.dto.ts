import { IsUUID } from 'class-validator';

export class MergeIncidentDto {
  /** The incident this one is a duplicate of — that one survives, this one is marked MERGED. */
  @IsUUID()
  targetIncidentId!: string;
}
