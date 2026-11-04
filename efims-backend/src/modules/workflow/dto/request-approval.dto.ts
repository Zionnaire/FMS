import { ApprovalAction, SeverityBand } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class RequestApprovalDto {
  @IsEnum(ApprovalAction)
  action!: ApprovalAction;

  /** Which of CD-04's two rows applies — a human judgment call, not inferred from a linked
   * incident's severity. See SeverityBand's doc comment in schema.prisma for why. */
  @IsEnum(SeverityBand)
  severityBand!: SeverityBand;

  @IsString()
  @MinLength(10)
  requestNotes!: string;
}
