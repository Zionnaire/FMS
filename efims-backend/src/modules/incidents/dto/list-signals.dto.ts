import { SignalSource, SignalStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListSignalsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SignalStatus)
  status?: SignalStatus;

  @IsOptional()
  @IsEnum(SignalSource)
  source?: SignalSource;

  @IsOptional()
  @IsString()
  q?: string;

  /** A literal `"true"`/`"false"` string, not `@Type(() => Boolean)` — that decorator calls bare
   * `Boolean(value)`, which is `true` for the string `"false"` too. The Incident Reporter
   * dashboard's "my reports" view is the one caller that sets this. */
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;
}
