import { IsString, MinLength } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  @MinLength(5)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;
}
