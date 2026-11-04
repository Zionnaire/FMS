import { Compartment, IncidentStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListIncidentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(Compartment)
  compartment?: Compartment;

  /** Case-insensitive substring match against title/referenceCode/category/type — applied in JS
   * alongside the compartment-visibility filter, same reasoning as CasesService's own `q`. */
  @IsOptional()
  @IsString()
  q?: string;

  /** Literal `"true"`/`"false"` string, same reasoning as `ListSignalsDto.mine`'s own doc
   * comment. The Incident Reporter dashboard's "my reports" view is the one caller that sets
   * this. */
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;
}
