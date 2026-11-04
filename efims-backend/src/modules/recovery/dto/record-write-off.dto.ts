import { IsNumber, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class RecordWriteOffDto {
  /** Must reference an `APPROVED` `ApprovalRequest` with `action = LOSS_WRITE_OFF` for this case
   * — see `ApprovalService.assertApproved`, the same gate `ContainmentService.create` uses for
   * `CONTAINMENT`. One approval authorizes exactly one write-off entry (`approvalId` is
   * `@unique`), same reuse-prevention `ContainmentRequest` learned live. */
  @IsUUID()
  approvalId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(5)
  justification!: string;
}
