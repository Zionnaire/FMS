import { ContainmentActionType } from '@prisma/client';
import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator';

export class RequestContainmentDto {
  /** Must reference an `APPROVED` `ApprovalRequest` with `action = CONTAINMENT` for this case —
   * see `ApprovalService.assertApproved`, the same gate `CasesService.updateStatus` uses for
   * case closure. */
  @IsUUID()
  approvalId!: string;

  @IsEnum(ContainmentActionType)
  actionType!: ContainmentActionType;

  @IsString()
  @MinLength(2)
  targetDescription!: string;

  @IsString()
  @MinLength(5)
  rationale!: string;
}
