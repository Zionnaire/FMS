import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';

enum RecoverySeverity {
  S1 = 'S1',
  S2 = 'S2',
  S3 = 'S3',
  S4 = 'S4',
}

/** The 4 fields EFIMS doesn't model anywhere today (severity/fraud_type/channel/
 * days_to_detection — see schema.prisma's `Incident` doc comment and the plan's "field-mapping
 * gaps" note) — entered by the analyst each time, since nothing stores them. `gross_actual_loss_
 * ngn` and `containment_confirmed` are NOT here: `RecoveryService.predictRecovery` derives both
 * from real case data itself, never trusting a client-supplied value for something already
 * known. */
export class PredictRecoveryDto {
  @IsEnum(RecoverySeverity)
  severity!: RecoverySeverity;

  @IsString()
  @MinLength(1)
  fraudType!: string;

  @IsString()
  @MinLength(1)
  channel!: string;

  @IsNumber()
  @Min(0)
  daysToDetection!: number;
}
