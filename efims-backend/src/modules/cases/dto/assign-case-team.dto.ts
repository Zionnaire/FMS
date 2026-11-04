import { IsUUID } from 'class-validator';

export class AssignCaseTeamDto {
  @IsUUID()
  teamId!: string;
}
