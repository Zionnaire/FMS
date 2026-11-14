/**
 * Thin, typed HTTP client for the EFIMS AI Service (a separate Python/FastAPI application — not
 * part of this repo — documented in the integration package the user's ML developer supplied).
 * Native `fetch` (Node 22), no new dependency. Every shape below mirrors that document's exact
 * JSON field names verbatim (snake_case on the wire) — deliberately NOT renamed to camelCase at
 * this layer, so a diff against the vendor's own sample payloads stays trivial; `ml-gateway.
 * service.ts` is where the camelCase EFIMS-shaped mapping happens, on both the way in and the
 * way out.
 *
 * This is the only file in this module allowed to issue an HTTP call to the EFIMS AI Service —
 * `MlGatewayService` is the only thing that imports it, same one-seam discipline CLAUDE.md
 * non-negotiable #4 already requires for Groq.
 */
import { Logger } from '@nestjs/common';

export class MlServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MlServiceUnavailableError';
  }
}

/** A 422 means OUR request mapping is wrong, not "the service is down" — the caller should let
 * this surface (400-equivalent), never silently fall back to Groq for it. */
export class MlServiceValidationError extends Error {
  constructor(
    message: string,
    public readonly detail: unknown,
  ) {
    super(message);
    this.name = 'MlServiceValidationError';
  }
}

export interface MlServiceHealth {
  status: 'healthy' | 'degraded';
  timestamp_wat: string;
  models: {
    severity: { status: string; version: string };
    anomaly: { status: string; version: string };
    recovery: { status: string; version: string };
  };
  service: string;
  version: string;
}

interface ExplanationFactor {
  feature: string;
  impact: 'high' | 'medium' | 'low';
  direction: 'increases_risk' | 'decreases_risk';
  value: unknown;
}

/** Fields every one of the three prediction endpoints' responses share. */
interface PredictionEnvelope {
  prediction_id: string;
  model_name: string;
  model_version: string;
  confidence_score: number;
  requires_human_review: boolean;
  explanation: ExplanationFactor[];
  timestamp_wat: string;
  disclaimer: string;
}

export interface SeverityPredictRequest {
  incident_id: string;
  financial_exposure_ngn: number;
  customer_impact_count: number;
  ongoing_threat: boolean;
  insider_involvement: boolean;
  data_compromise: boolean;
  regulatory_relevance: boolean;
  source: string;
  channel: string;
  incident_type: string;
  reported_by_type: string;
  narrative?: string;
  narrative_length?: number;
  requester_id?: string;
  request_timestamp?: string;
}

export interface SeverityPredictResponse extends PredictionEnvelope {
  severity_prediction: 'S1' | 'S2' | 'S3' | 'S4';
  severity_score: number;
  all_class_probabilities: Record<'S1' | 'S2' | 'S3' | 'S4', number>;
  available_at_prediction_time: boolean;
  top_factors: ExplanationFactor[];
}

export interface AnomalyScoreRequest {
  transaction_id: string;
  amount_ngn: number;
  channel: string;
  transaction_type: string;
  velocity_indicator: 'Normal' | 'Elevated' | 'High';
  ip_risk_score: number;
  device_risk_score: number;
  is_reversal: boolean;
  is_chargeback: boolean;
  account_risk_rating: 'Low' | 'Medium' | 'High';
}

export interface AnomalyScoreResponse extends PredictionEnvelope {
  anomaly_score: number;
  is_suspicious: boolean;
  anomaly_type: string | null;
  behavioural_signals: string[];
}

export interface RecoveryPredictRequest {
  case_id: string;
  gross_actual_loss_ngn: number;
  severity: 'S1' | 'S2' | 'S3' | 'S4';
  fraud_type: string;
  channel: string;
  days_to_detection: number;
  containment_confirmed: boolean;
}

export interface RecoveryPredictResponse extends PredictionEnvelope {
  recovery_probability: number;
  recovery_success_prediction: boolean;
  key_recovery_factors: ExplanationFactor[];
  recommended_recovery_actions: string[];
}

const REQUEST_TIMEOUT_MS = 5000;

export class MlServiceClient {
  private readonly logger = new Logger(MlServiceClient.name);

  constructor(private readonly baseUrl: string) {}

  async getHealth(): Promise<MlServiceHealth> {
    return this.request<MlServiceHealth>('GET', '/api/v1/health');
  }

  async predictSeverity(body: SeverityPredictRequest): Promise<SeverityPredictResponse> {
    return this.request<SeverityPredictResponse>('POST', '/api/v1/severity/predict', body);
  }

  async scoreAnomaly(body: AnomalyScoreRequest): Promise<AnomalyScoreResponse> {
    return this.request<AnomalyScoreResponse>('POST', '/api/v1/anomaly/score', body);
  }

  async predictRecovery(body: RecoveryPredictRequest): Promise<RecoveryPredictResponse> {
    return this.request<RecoveryPredictResponse>('POST', '/api/v1/recovery/predict', body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`EFIMS AI Service unreachable at ${this.baseUrl}${path}: ${(err as Error).message}`);
      throw new MlServiceUnavailableError(`EFIMS AI Service unreachable: ${(err as Error).message}`);
    }

    if (response.status === 422) {
      const detail = await response.json().catch(() => null);
      throw new MlServiceValidationError('EFIMS AI Service rejected the request as invalid', detail);
    }
    if (response.status === 503) {
      throw new MlServiceUnavailableError('EFIMS AI Service reports a model is not loaded');
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      this.logger.error(`EFIMS AI Service returned ${response.status} for ${path}: ${JSON.stringify(detail)}`);
      throw new MlServiceUnavailableError(`EFIMS AI Service returned ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
