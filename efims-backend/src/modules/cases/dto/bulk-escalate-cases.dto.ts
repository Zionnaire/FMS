import { ArrayMinSize, IsArray, IsString, IsUUID, MinLength } from 'class-validator';

export class BulkEscalateCasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  caseIds!: string[];

  @IsString()
  @MinLength(5)
  reason!: string;
}
