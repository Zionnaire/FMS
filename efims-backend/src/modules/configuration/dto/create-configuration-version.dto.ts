import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateConfigurationVersionDto {
  /** Structurally validated per-key in ConfigurationService (see
   * types/cd-value.validators.ts) — `class-validator` only confirms "it's an object" here,
   * since the actual shape depends on which `:key` this is posted to. */
  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  notes?: string;
}
