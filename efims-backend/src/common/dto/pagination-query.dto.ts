import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared `limit`/`offset` query shape — extend this rather than redeclaring the same two
 * fields on every list DTO. Capped at 100 per page; the audit/notifications endpoints
 * established this same cap independently before this shared class existed. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
