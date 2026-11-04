import { CaseStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class UpdateCaseStatusDto {
  @IsEnum(CaseStatus)
  status!: CaseStatus;

  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;

  /** Required only when `status` is CLOSED — the id of an already-APPROVED `ApprovalRequest`
   * (action=CASE_CLOSURE) for this case. See ApprovalService.assertApproved and the doc comment
   * on CasesService.updateStatus for why this references a specific prior decision rather than
   * the service re-deriving which severity band/approval applies. */
  @ValidateIf((dto: UpdateCaseStatusDto) => dto.status === CaseStatus.CLOSED)
  @IsUUID()
  approvalId?: string;
}
