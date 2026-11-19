import { IsEnum } from 'class-validator';

enum PredictionDecisionInput {
  ACCEPTED = 'ACCEPTED',
  OVERRIDDEN = 'OVERRIDDEN',
}

/** Body for `PATCH ml-gateway/predictions/:predictionId/decision` — the vendor's v1.0 integration
 * spec's rule #3 ("record whether the analyst accepted or overrode it"). Deliberately just the
 * two terminal states, not PENDING — a caller can't reset a decision back to pending through
 * this endpoint; see `MlGatewayService.decidePrediction`'s own doc comment for why. */
export class DecidePredictionDto {
  @IsEnum(PredictionDecisionInput)
  decision!: 'ACCEPTED' | 'OVERRIDDEN';
}
