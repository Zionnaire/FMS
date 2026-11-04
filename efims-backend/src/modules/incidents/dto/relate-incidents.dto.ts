import { IsUUID } from 'class-validator';

export class RelateIncidentsDto {
  @IsUUID()
  relatedIncidentId!: string;
}
