import { IsString, MinLength } from 'class-validator';

export class ResolveIssueDto {
  @IsString()
  @MinLength(10)
  resolution!: string;
}
