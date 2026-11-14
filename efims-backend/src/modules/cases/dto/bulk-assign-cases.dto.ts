import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkAssignCasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  caseIds!: string[];

  @IsUUID()
  teamId!: string;
}
