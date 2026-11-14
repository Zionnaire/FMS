import { CaseStatus, Compartment } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListCasesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(Compartment)
  compartment?: Compartment;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  sensitivityLevel?: number;

  /** Case-insensitive substring match against title/referenceCode — applied in JS alongside the
   * access filter, same as every other filter here, not a SQL ILIKE (see CasesService.list's own
   * doc comment on why the access-filtered set can't be paginated at the SQL layer either). */
  @IsOptional()
  @IsString()
  q?: string;

  /** Severity/overdue segmented filter — a case has no severity of its own, it's rolled up from
   * linked incidents (see `CaseListItem.effectiveSeverity`'s own doc comment), so this is a
   * distinct filter dimension from `status` above, not a replacement for it. */
  @IsOptional()
  @IsIn(['s1-s2', 'overdue'])
  sevFilter?: 's1-s2' | 'overdue';
}
