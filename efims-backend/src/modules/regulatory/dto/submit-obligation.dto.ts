import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SubmitObligationDto {
  /** Must reference an `APPROVED` `ApprovalRequest` with `action = REGULATORY_SUBMISSION` for
   * this case — see `ApprovalService.assertApproved`, the same gate `ContainmentService.create`/
   * `RecoveryService.recordWriteOff` use for their own CD-04 actions. One approval authorizes
   * exactly one submission (`approvalId` is `@unique`). */
  @IsUUID()
  approvalId!: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
