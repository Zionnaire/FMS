import { IsBoolean, IsString, ValidateIf } from 'class-validator';

/** `reason` is required whenever `watchlisted` is true (enforced here, not just in the service,
 * so a bad request is rejected before any write) — never required when clearing the flag. */
export class SetWatchlistDto {
  @IsBoolean()
  watchlisted!: boolean;

  @ValidateIf((dto: SetWatchlistDto) => dto.watchlisted)
  @IsString()
  reason?: string;
}
