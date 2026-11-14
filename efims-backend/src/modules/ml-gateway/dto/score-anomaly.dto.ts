import { IsBoolean, IsEnum, IsNumber, IsString, Max, Min, MinLength } from 'class-validator';

enum VelocityIndicator {
  Normal = 'Normal',
  Elevated = 'Elevated',
  High = 'High',
}

enum AccountRiskRating {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

/** Mirrors the EFIMS AI Service's `/api/v1/anomaly/score` request shape exactly (see
 * `ml-service-client.ts`'s `AnomalyScoreRequest`) — camelCase here, mapped to the vendor's
 * snake_case in `MlGatewayService.scoreAnomaly`. */
export class ScoreAnomalyDto {
  @IsString()
  @MinLength(1)
  transactionId!: string;

  @IsNumber()
  @Min(0)
  amountNgn!: number;

  @IsString()
  @MinLength(1)
  channel!: string;

  @IsString()
  @MinLength(1)
  transactionType!: string;

  @IsEnum(VelocityIndicator)
  velocityIndicator!: VelocityIndicator;

  @IsNumber()
  @Min(0)
  @Max(1)
  ipRiskScore!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  deviceRiskScore!: number;

  @IsBoolean()
  isReversal!: boolean;

  @IsBoolean()
  isChargeback!: boolean;

  @IsEnum(AccountRiskRating)
  accountRiskRating!: AccountRiskRating;
}
