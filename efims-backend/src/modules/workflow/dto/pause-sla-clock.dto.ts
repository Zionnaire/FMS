import { IsString, MinLength } from 'class-validator';

export class PauseSlaClockDto {
  /** Required — CD-03: "Any SLA pause requires a logged reason and approval." The approval
   * half is the role gate on the controller route; this is the logged reason. */
  @IsString()
  @MinLength(10)
  reason!: string;
}
