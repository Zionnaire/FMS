import { Compartment } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateCaseDto {
  @IsString()
  @MinLength(5)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  /** Required, deliberately — see the doc comment on Case.sensitivityLevel in schema.prisma for
   * why this is never auto-derived from a linked incident's severity. 1-4, same scale as
   * User.clearanceLevel. */
  @IsInt()
  @Min(1)
  @Max(4)
  sensitivityLevel!: number;

  @IsOptional()
  @IsEnum(Compartment)
  compartment?: Compartment;

  @IsOptional()
  @IsUUID()
  assignedTeamId?: string;

  /** Incidents to link at creation time — optional; more can be linked later via
   * `POST /cases/:id/incidents`. Each must already be visible to the caller (checked via
   * IncidentsService.getById) and in a linkable status (OPEN or UNDER_REVIEW). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  incidentIds?: string[];
}
