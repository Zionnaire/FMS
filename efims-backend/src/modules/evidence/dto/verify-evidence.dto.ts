import { IsString, MinLength } from 'class-validator';

/** The same content originally supplied to `IngestEvidenceDto`, re-supplied for hash comparison —
 * this module never stores the content itself, so verification has no stored copy to check
 * against other than the hash. */
export class VerifyEvidenceDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
