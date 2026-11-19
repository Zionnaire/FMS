import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MlPredictionCapability, MlPredictionDecision } from '@prisma/client';
import OpenAI from 'openai';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AnomalyScoreRequest,
  AnomalyScoreResponse,
  MlServiceClient,
  MlServiceHealth,
  MlServiceValidationError,
  RecoveryPredictRequest,
  RecoveryPredictResponse,
  SeverityPredictRequest,
  SeverityPredictResponse,
} from './ml-service-client';

export interface SeveritySuggestion {
  suggestedSeverity: 'S1' | 'S2' | 'S3' | 'S4';
  confidence: number;
  citedFactors: string[];
  rationale: string;
  /** Which engine actually answered — surfaced to the UI so an analyst always knows whether the
   * primary structured model or the Groq fallback produced a given suggestion. Never hidden:
   * CD-08's "advisory, human decides" guardrail applies identically either way, but which model
   * is speaking is itself something a human reviewer should be able to see. */
  source: 'structured-ml' | 'groq-fallback';
  predictionId: string | null;
  requiresHumanReview: boolean;
  allClassProbabilities?: Record<'S1' | 'S2' | 'S3' | 'S4', number>;
}

export interface SeveritySuggestionInput {
  incidentId: string;
  category: string;
  type: string;
  title: string;
  description: string;
  signalSummary?: string;
  /** EFIMS's own `SignalSource` enum value, if this incident originated from a signal — mapped
   * to the EFIMS AI Service's own vocabulary below. */
  signalSource?: string | null;
  financialExposureNgn?: number | null;
  customerImpactCount?: number | null;
  ongoingThreat?: boolean | null;
  insiderInvolvement?: boolean | null;
  dataCompromise?: boolean | null;
  regulatoryRelevance?: boolean | null;
  channel?: string | null;
  reportedByType?: string | null;
  /** Opt-in only (2026-11-14 decision — see CLAUDE.md non-negotiable #4's dated note): an
   * LLM-generated severity label is not a validated predictive classifier, so it no longer stands
   * in automatically whenever the EFIMS AI Service is unreachable or risk factors are missing.
   * The caller (ultimately a human clicking a second, explicit button in the UI) must ask for it. */
  allowLlmFallback?: boolean;
}

export interface SimilarIncidentCandidateInput {
  id: string;
  referenceCode: string;
  category: string;
  type: string;
  title: string;
  description: string;
}

export interface SimilarIncidentResult {
  incidentId: string;
  score: number;
  citedFactors: string[];
}

export interface AnomalyScoreInput {
  transactionId: string;
  amountNgn: number;
  channel: string;
  transactionType: string;
  velocityIndicator: 'Normal' | 'Elevated' | 'High';
  ipRiskScore: number;
  deviceRiskScore: number;
  isReversal: boolean;
  isChargeback: boolean;
  accountRiskRating: 'Low' | 'Medium' | 'High';
}

export interface AnomalySuggestion {
  predictionId: string;
  confidence: number;
  requiresHumanReview: boolean;
  anomalyScore: number;
  isSuspicious: boolean;
  anomalyType: string | null;
  behaviouralSignals: string[];
  disclaimer: string;
}

export interface RecoveryPredictionInput {
  caseId: string;
  grossActualLossNgn: number;
  severity: 'S1' | 'S2' | 'S3' | 'S4';
  fraudType: string;
  channel: string;
  daysToDetection: number;
  containmentConfirmed: boolean;
}

export interface RecoverySuggestion {
  predictionId: string;
  confidence: number;
  requiresHumanReview: boolean;
  recoveryProbability: number;
  recoverySuccessPrediction: boolean;
  keyFactors: string[];
  recommendedActions: string[];
  disclaimer: string;
}

/** EFIMS's `SignalSource` enum -> the EFIMS AI Service's own fixed vocabulary (CD-01 is
 * tenant-configured free text; this one small enum is the one EFIMS field with a real fixed set
 * worth a lookup table — see the plan's "field-mapping gaps" note for why the rest are passed
 * through as-is rather than force-mapped). */
const SIGNAL_SOURCE_TO_VENDOR: Record<string, string> = {
  RULE_ENGINE: 'Automated Detection',
  CUSTOMER_COMPLAINT: 'Customer Complaint',
  STAFF_REPORT: 'Staff Report',
  WHISTLEBLOWER: 'Whistleblowing',
  THIRD_PARTY: 'External Referral',
  MANUAL_ENTRY: 'Manual Discovery',
};

function shortFactorLabel(feature: string, direction: 'increases_risk' | 'decreases_risk'): string {
  const label = feature.replace(/_encoded$/, '').replaceAll('_', ' ');
  return `${label} (${direction === 'increases_risk' ? '+' : '−'})`;
}

/** What to log a structured-model prediction against — the caller (the module that actually
 * knows what entity this request was about) supplies this; `MlGatewayService` never guesses it. */
export interface MlPredictionLogContext {
  tenantId: string;
  entityType: 'Incident' | 'Case' | 'Transaction';
  entityId: string;
  requestedBy: string;
}

/**
 * The ONLY module allowed to call an external AI/ML provider anywhere in this codebase (CLAUDE.md
 * non-negotiable #4). Every method here is read-only and advisory with respect to EFIMS's own
 * case/incident data — it returns a suggestion object and never writes to another module's
 * tables or fires an autonomous action. The one exception is this module's OWN durable prediction
 * log (`MlPredictionRecord`, added alongside the real EFIMS AI Service integration): the vendor's
 * v1.0 integration spec requires storing every `prediction_id` plus whether a human later accepted
 * or overrode it, for retraining — that's bookkeeping about a suggestion, not an action on it.
 *
 * Two providers, two different roles:
 * - **EFIMS AI Service** (a separate Python/FastAPI application the user's ML developer supplied,
 *   `ml-service-client.ts`) — the SOURCE OF TRUTH for everything it covers: severity prediction
 *   (primary), transaction anomaly scoring, and recovery-probability prediction. Its own
 *   documentation is explicit that its models are trained on synthetic data and are "not for real
 *   case decisions" yet (severity S1 has only 3 training examples; recovery's cross-validated
 *   ROC-AUC is 0.627) — carried over here verbatim rather than smoothed over, per this project's
 *   standing rule to never represent a capability as more reliable than its own docs say.
 * - **Groq** (LLM, `openai` SDK pointed at Groq's base URL) — kept only as (a) an **opt-in-only**
 *   fallback for severity if the EFIMS AI Service is unreachable (`allowLlmFallback` — see the
 *   2026-11-14 decision note on `SeveritySuggestionInput` below; this is NOT automatic), and (b)
 *   the sole engine for duplicate/correlation detection, which the EFIMS AI Service doesn't cover
 *   at all. A Groq-fallback suggestion carries no vendor `prediction_id` and is never written to
 *   `MlPredictionRecord` — there's nothing to send back to the vendor for retraining.
 */
@Injectable()
export class MlGatewayService {
  private readonly logger = new Logger(MlGatewayService.name);
  private readonly groqClient: OpenAI | null;
  private readonly groqModel: string;
  private readonly mlServiceClient: MlServiceClient;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    this.groqModel = this.config.get<string>('GROQ_MODEL', 'llama-3.3-70b-versatile');
    // Deliberately doesn't throw at startup if unconfigured — a missing AI credential shouldn't
    // take down the whole backend; every method below fails loudly and specifically (503) only
    // when actually called.
    this.groqClient = apiKey && apiKey !== 'dev-only-change-me-groq' ? new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' }) : null;
    const mlServiceApiKey = this.config.get<string>('ML_SERVICE_API_KEY');
    this.mlServiceClient = new MlServiceClient(
      this.config.get<string>('ML_SERVICE_BASE_URL', 'http://127.0.0.1:8000'),
      mlServiceApiKey && mlServiceApiKey !== 'dev-only-change-me-ml-service' ? mlServiceApiKey : undefined,
    );
  }

  /** Writes one `MlPredictionRecord` row for a structured-model (never Groq-fallback) response.
   * Fire-and-forget from the caller's point of view in spirit, but actually awaited so a logging
   * failure surfaces rather than silently losing a retraining row — it just never blocks the
   * suggestion itself from having already been computed. */
  private async logPrediction(
    capability: MlPredictionCapability,
    predictionId: string,
    requiresHumanReview: boolean,
    rawResponse: unknown,
    ctx?: MlPredictionLogContext,
  ): Promise<void> {
    if (!ctx) return;
    try {
      await this.prisma.forCurrentTenant((tx) =>
        tx.mlPredictionRecord.create({
          data: {
            tenantId: ctx.tenantId,
            capability,
            predictionId,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
            requestedBy: ctx.requestedBy,
            requiresHumanReview,
            rawResponse: rawResponse as object,
          },
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to log ${capability} prediction ${predictionId} for retraining: ${(err as Error).message}`);
    }
  }

  private assertGroqConfigured(): OpenAI {
    if (!this.groqClient) {
      throw new ServiceUnavailableException('ml-gateway is not configured (GROQ_API_KEY missing) — AI suggestions are unavailable');
    }
    return this.groqClient;
  }

  async getMlServiceHealth(): Promise<MlServiceHealth> {
    try {
      return await this.mlServiceClient.getHealth();
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }
  }

  /** Primary severity engine (EFIMS AI Service's structured model), automatic Groq fallback on
   * unreachability — Groq is now opt-in only (`input.allowLlmFallback`), per the 2026-11-14
   * decision: an LLM label isn't a validated classifier, so it no longer stands in silently.
   * Requires the incident's risk-factor fields to all be set (see schema.prisma's doc comment on
   * `Incident`'s new nullable columns) to even attempt the structured model — if any are
   * missing, this returns unavailable (same as the ML-service-unreachable case) rather than
   * sending it fabricated/default values it was never designed to receive. A 422 from the
   * structured model (our own request mapping is wrong) is NOT treated as "unreachable" — it
   * surfaces as a 400, since falling back would hide a real bug in this mapping layer, and opting
   * into Groq wouldn't fix it either. */
  async suggestSeverity(input: SeveritySuggestionInput, ctx?: MlPredictionLogContext): Promise<SeveritySuggestion> {
    const hasAllRiskFactors =
      input.financialExposureNgn != null &&
      input.customerImpactCount != null &&
      input.ongoingThreat != null &&
      input.insiderInvolvement != null &&
      input.dataCompromise != null &&
      input.regulatoryRelevance != null &&
      !!input.channel &&
      !!input.reportedByType;

    if (hasAllRiskFactors) {
      try {
        return await this.suggestSeverityViaMlService(input, ctx);
      } catch (err) {
        if (err instanceof MlServiceValidationError) {
          throw new BadRequestException(`EFIMS AI Service rejected the severity request: ${JSON.stringify(err.detail)}`);
        }
        if (!input.allowLlmFallback) {
          throw new ServiceUnavailableException(
            'EFIMS AI Service is unavailable for severity prediction. Retry with an explicit LLM-estimate request if you want a Groq-based estimate instead.',
          );
        }
        this.logger.warn(`Falling back to Groq for severity suggestion (incident ${input.incidentId}, explicitly requested): ${(err as Error).message}`);
      }
    } else if (!input.allowLlmFallback) {
      throw new ServiceUnavailableException(
        'This incident is missing risk-factor fields the structured severity model needs. Retry with an explicit LLM-estimate request if you want a Groq-based estimate instead.',
      );
    } else {
      this.logger.debug(`Incident ${input.incidentId} is missing risk-factor fields — using Groq severity suggestion (explicitly requested)`);
    }

    return this.suggestSeverityViaGroq(input);
  }

  private async suggestSeverityViaMlService(input: SeveritySuggestionInput, ctx?: MlPredictionLogContext): Promise<SeveritySuggestion> {
    const request: SeverityPredictRequest = {
      incident_id: input.incidentId,
      financial_exposure_ngn: input.financialExposureNgn!,
      customer_impact_count: input.customerImpactCount!,
      ongoing_threat: input.ongoingThreat!,
      insider_involvement: input.insiderInvolvement!,
      data_compromise: input.dataCompromise!,
      regulatory_relevance: input.regulatoryRelevance!,
      source: (input.signalSource && SIGNAL_SOURCE_TO_VENDOR[input.signalSource]) || 'Manual Discovery',
      channel: input.channel!,
      incident_type: input.type,
      reported_by_type: input.reportedByType!,
      narrative: input.description,
    };

    const response: SeverityPredictResponse = await this.mlServiceClient.predictSeverity(request);
    await this.logPrediction(MlPredictionCapability.SEVERITY, response.prediction_id, response.requires_human_review, response, ctx);

    return {
      suggestedSeverity: response.severity_prediction,
      confidence: response.confidence_score,
      citedFactors: response.top_factors.map((f) => shortFactorLabel(f.feature, f.direction)),
      rationale: `Structured model (${response.model_version}) suggests ${response.severity_prediction} at ${Math.round(response.confidence_score * 100)}% confidence.`,
      source: 'structured-ml',
      predictionId: response.prediction_id,
      requiresHumanReview: response.requires_human_review,
      allClassProbabilities: response.all_class_probabilities,
    };
  }

  /** CD-08 Phase 2, item one — the original Groq-only implementation, now the fallback path.
   * Reads the incident's own description/category/type (and, when linked, the originating
   * signal's summary) against CD-02's literal tier criteria. */
  private async suggestSeverityViaGroq(input: SeveritySuggestionInput): Promise<SeveritySuggestion> {
    const client = this.assertGroqConfigured();

    const prompt = `You are an advisory severity-triage assistant for a bank's fraud/incident management system. You NEVER make the final decision — a human always does. Your job is only to suggest a severity tier with your reasoning, citing the specific factors that led to your suggestion.

Severity tiers (CD-02 — a case is scored at the HIGHEST tier any single criterion triggers):
- S1 (Critical): financial loss above the institution's "material loss" line, OR multiple/systemic customer impact, OR mandatory immediate regulator notification, OR immediate 24x7 containment urgency.
- S2 (High): mid-band financial loss, OR a single major customer or several customers affected, OR regulatory reporting required within the standard statutory window, OR same-business-day containment urgency.
- S3 (Medium): lower-band financial loss, OR limited/single-customer impact, OR no immediate regulatory trigger (may need internal reporting only), OR SLA allows business-hours response.
- S4 (Low): near-miss or no realized loss, OR no/negligible customer impact, OR no regulatory trigger, OR standard queue.

Incident:
- Category: ${input.category}
- Type: ${input.type}
- Title: ${input.title}
- Description: ${input.description}
${input.signalSummary ? `- Originating signal: ${input.signalSummary}` : ''}

Respond with ONLY a JSON object, no other text, in this exact shape:
{"suggestedSeverity": "S1"|"S2"|"S3"|"S4", "confidence": <number 0-1>, "citedFactors": [<short strings, 2-4 factors>], "rationale": "<1-2 sentences>"}`;

    const completion = await client.chat.completions.create({
      model: this.groqModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new ServiceUnavailableException('ml-gateway received an empty response from Groq');
    }

    try {
      const parsed = JSON.parse(raw) as { suggestedSeverity: SeveritySuggestion['suggestedSeverity']; confidence: number; citedFactors: string[]; rationale: string };
      return {
        suggestedSeverity: parsed.suggestedSeverity,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        citedFactors: Array.isArray(parsed.citedFactors) ? parsed.citedFactors.slice(0, 6) : [],
        rationale: String(parsed.rationale ?? ''),
        source: 'groq-fallback',
        predictionId: null,
        requiresHumanReview: true,
      };
    } catch (err) {
      this.logger.error('Failed to parse Groq severity-suggestion response', err as Error);
      throw new ServiceUnavailableException('ml-gateway received an unparseable response from Groq');
    }
  }

  /** New capability — the EFIMS AI Service's transaction anomaly scorer. No Groq equivalent
   * exists; on unreachability this surfaces as 503, same convention `ml-gateway` already uses for
   * an unconfigured Groq client. */
  async scoreAnomaly(input: AnomalyScoreInput, ctx?: MlPredictionLogContext): Promise<AnomalySuggestion> {
    const request: AnomalyScoreRequest = {
      transaction_id: input.transactionId,
      amount_ngn: input.amountNgn,
      channel: input.channel,
      transaction_type: input.transactionType,
      velocity_indicator: input.velocityIndicator,
      ip_risk_score: input.ipRiskScore,
      device_risk_score: input.deviceRiskScore,
      is_reversal: input.isReversal,
      is_chargeback: input.isChargeback,
      account_risk_rating: input.accountRiskRating,
    };

    let response: AnomalyScoreResponse;
    try {
      response = await this.mlServiceClient.scoreAnomaly(request);
    } catch (err) {
      if (err instanceof MlServiceValidationError) {
        throw new BadRequestException(`EFIMS AI Service rejected the anomaly request: ${JSON.stringify(err.detail)}`);
      }
      throw new ServiceUnavailableException((err as Error).message);
    }

    await this.logPrediction(MlPredictionCapability.ANOMALY, response.prediction_id, response.requires_human_review, response, ctx);

    return {
      predictionId: response.prediction_id,
      confidence: response.confidence_score,
      requiresHumanReview: response.requires_human_review,
      anomalyScore: response.anomaly_score,
      isSuspicious: response.is_suspicious,
      anomalyType: response.anomaly_type,
      behaviouralSignals: response.behavioural_signals,
      disclaimer: response.disclaimer,
    };
  }

  /** New capability — the EFIMS AI Service's recovery-probability predictor. No Groq equivalent
   * exists; on unreachability this surfaces as 503. */
  async predictRecovery(input: RecoveryPredictionInput, ctx?: MlPredictionLogContext): Promise<RecoverySuggestion> {
    const request: RecoveryPredictRequest = {
      case_id: input.caseId,
      gross_actual_loss_ngn: input.grossActualLossNgn,
      severity: input.severity,
      fraud_type: input.fraudType,
      channel: input.channel,
      days_to_detection: input.daysToDetection,
      containment_confirmed: input.containmentConfirmed,
    };

    let response: RecoveryPredictResponse;
    try {
      response = await this.mlServiceClient.predictRecovery(request);
    } catch (err) {
      if (err instanceof MlServiceValidationError) {
        throw new BadRequestException(`EFIMS AI Service rejected the recovery request: ${JSON.stringify(err.detail)}`);
      }
      throw new ServiceUnavailableException((err as Error).message);
    }

    await this.logPrediction(MlPredictionCapability.RECOVERY, response.prediction_id, response.requires_human_review, response, ctx);

    return {
      predictionId: response.prediction_id,
      confidence: response.confidence_score,
      requiresHumanReview: response.requires_human_review,
      recoveryProbability: response.recovery_probability,
      recoverySuccessPrediction: response.recovery_success_prediction,
      keyFactors: response.key_recovery_factors.map((f) => shortFactorLabel(f.feature, f.direction)),
      recommendedActions: response.recommended_recovery_actions,
      disclaimer: response.disclaimer,
    };
  }

  /** CD-08 Phase 2, item two. Compares one incident against a small candidate set (already
   * access-filtered by the caller — `IncidentsService` — before this method ever sees them) and
   * returns a scored similarity list. Groq-only — the EFIMS AI Service has no overlapping
   * capability, so there's nothing to prefer it over here. The caller wires the result to its own
   * already-existing, already-tested merge/link/reject actions — this method only ever finds and
   * scores, never merges or links anything itself. */
  async findSimilarIncidents(
    target: SimilarIncidentCandidateInput,
    candidates: SimilarIncidentCandidateInput[],
  ): Promise<SimilarIncidentResult[]> {
    if (candidates.length === 0) return [];
    const client = this.assertGroqConfigured();

    const prompt = `You are an advisory duplicate/correlation assistant for a bank's fraud/incident management system. You NEVER merge, link, or reject anything yourself — a human always decides. Your job is only to score how similar each candidate incident is to the target incident, citing the specific overlapping factors (e.g. same category/type, similar description, matching keywords).

Target incident (${target.referenceCode}):
- Category: ${target.category} / ${target.type}
- Title: ${target.title}
- Description: ${target.description}

Candidate incidents:
${candidates.map((c, i) => `${i}. (${c.referenceCode}) ${c.category} / ${c.type} — "${c.title}": ${c.description}`).join('\n')}

Respond with ONLY a JSON object, no other text, in this exact shape (omit any candidate scoring below 0.3, and never include the target itself):
{"matches": [{"index": <candidate index above>, "score": <number 0-1>, "citedFactors": [<short strings>]}]}`;

    const completion = await client.chat.completions.create({
      model: this.groqModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new ServiceUnavailableException('ml-gateway received an empty response from Groq');
    }

    try {
      const parsed = JSON.parse(raw) as { matches: { index: number; score: number; citedFactors: string[] }[] };
      const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
      return matches
        .filter((m) => Number.isInteger(m.index) && m.index >= 0 && m.index < candidates.length)
        .map((m) => ({
          incidentId: candidates[m.index].id,
          score: Math.max(0, Math.min(1, Number(m.score) || 0)),
          citedFactors: Array.isArray(m.citedFactors) ? m.citedFactors.slice(0, 6) : [],
        }))
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      this.logger.error('Failed to parse Groq similarity response', err as Error);
      throw new ServiceUnavailableException('ml-gateway received an unparseable response from Groq');
    }
  }

  /** Read-only lookup, tenant-scoped like every other method here. Exists so a caller that
   * already knows how to check access on a specific entity (`TriageService`/`RecoveryService`,
   * both of which already depend on this module) can verify a prediction's `entityType`/
   * `entityId` actually matches the entity it's about to run its own access check against,
   * before deciding it — see `decidePrediction`'s own doc comment on why this module can't run
   * that check itself. */
  async getPredictionRecord(actor: AuthenticatedUser, predictionId: string) {
    const record = await this.prisma.forCurrentTenant((tx) =>
      tx.mlPredictionRecord.findUnique({ where: { tenantId_predictionId: { tenantId: actor.tenantId, predictionId } } }),
    );
    if (!record) {
      throw new NotFoundException(`No logged prediction found with id ${predictionId}`);
    }
    return record;
  }

  /** The other half of the vendor's rule #3 ("record whether the analyst accepted or overrode
   * it"). Called once a human actually acts on a logged structured-model suggestion — never by
   * this module itself. Mutates PENDING -> ACCEPTED|OVERRIDDEN exactly once, same one-way-decide
   * shape as `ApprovalService.decide`; a prediction that's already been decided can't be
   * re-decided (no legitimate "change your mind" flow is modeled — a human who acts twice should
   * record a fresh event under whichever other module owns that follow-up action, not mutate the
   * retraining record of what they originally decided).
   *
   * Deliberately does NOT check compartment/clearance access on the prediction's underlying
   * entity (a SEVERITY prediction's `Incident`, a RECOVERY prediction's `Case`) — this module
   * can't: `IncidentsModule` already imports `MlGatewayModule`, and `CasesModule` imports
   * `TriageModule` which also imports it, so the reverse dependency this check would need creates
   * a circular module graph. Callers that own an entity-access check
   * (`TriageService.decideSeveritySuggestion`, `RecoveryService.decideRecoveryPrediction`) must
   * run it themselves, via `getPredictionRecord`, before calling this. A caller with no entity to
   * check (`MlGatewayController`'s own route, ANOMALY only — nothing in EFIMS models a
   * `Transaction`) calls this directly. */
  async decidePrediction(actor: AuthenticatedUser, predictionId: string, decision: 'ACCEPTED' | 'OVERRIDDEN'): Promise<void> {
    const record = await this.getPredictionRecord(actor, predictionId);
    if (record.decision !== MlPredictionDecision.PENDING) {
      throw new BadRequestException(`Prediction ${predictionId} was already recorded as ${record.decision}`);
    }

    await this.prisma.forCurrentTenant((tx) =>
      tx.mlPredictionRecord.update({
        where: { id: record.id },
        data: { decision: decision as MlPredictionDecision, decidedBy: actor.sub, decidedAt: new Date() },
      }),
    );
  }
}
