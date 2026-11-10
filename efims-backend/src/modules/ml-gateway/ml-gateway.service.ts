import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface SeveritySuggestion {
  suggestedSeverity: 'S1' | 'S2' | 'S3' | 'S4';
  confidence: number;
  citedFactors: string[];
  rationale: string;
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

/**
 * The ONLY module allowed to call Groq anywhere in this codebase (CLAUDE.md non-negotiable #4).
 * Every method here is read-only and advisory: it returns a suggestion object and never writes
 * to any table, never calls another module's write path, never fires an autonomous action. This
 * is the mechanical enforcement of that non-negotiable, not just a comment — there is no method
 * on this service, and never should be, that accepts a "just do it" call.
 *
 * Builds exactly CD-08's Phase 2 (docs/configuration-decisions.md): severity-suggestion and
 * duplicate-detection, with its guardrail implemented literally — "Advisory score + confidence +
 * cited factors only; human sets final severity." Nothing further up CD-08's roadmap (narrative
 * generation, anomaly detection, case summarization) is attempted here.
 *
 * Groq's API is OpenAI-compatible, so the `openai` SDK is reused, pointed at Groq's base URL
 * instead of OpenAI's — no separate Groq-specific client exists or is needed.
 */
@Injectable()
export class MlGatewayService {
  private readonly logger = new Logger(MlGatewayService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    this.model = this.config.get<string>('GROQ_MODEL', 'llama-3.3-70b-versatile');
    // Deliberately doesn't throw at startup if unconfigured — a missing AI credential shouldn't
    // take down the whole backend; every method below fails loudly and specifically (503) only
    // when actually called, which is also the only place CD-08's advisory surface is reached.
    this.client = apiKey && apiKey !== 'dev-only-change-me-groq' ? new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' }) : null;
  }

  private assertConfigured(): OpenAI {
    if (!this.client) {
      throw new ServiceUnavailableException('ml-gateway is not configured (GROQ_API_KEY missing) — AI suggestions are unavailable');
    }
    return this.client;
  }

  /** CD-08 Phase 2, item one. Reads the incident's own description/category/type (and, when
   * linked, the originating signal's summary) against CD-02's literal tier criteria, and returns
   * a suggestion — never a decision. The caller (`TriageService`) never writes this value
   * anywhere; it's surfaced to the human assessing the incident alongside their own severity
   * picker, exactly as CD-08 requires. */
  async suggestSeverity(input: {
    category: string;
    type: string;
    title: string;
    description: string;
    signalSummary?: string;
  }): Promise<SeveritySuggestion> {
    const client = this.assertConfigured();

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
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new ServiceUnavailableException('ml-gateway received an empty response from Groq');
    }

    try {
      const parsed = JSON.parse(raw) as SeveritySuggestion;
      return {
        suggestedSeverity: parsed.suggestedSeverity,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        citedFactors: Array.isArray(parsed.citedFactors) ? parsed.citedFactors.slice(0, 6) : [],
        rationale: String(parsed.rationale ?? ''),
      };
    } catch (err) {
      this.logger.error('Failed to parse Groq severity-suggestion response', err as Error);
      throw new ServiceUnavailableException('ml-gateway received an unparseable response from Groq');
    }
  }

  /** CD-08 Phase 2, item two. Compares one incident against a small candidate set (already
   * access-filtered by the caller — `IncidentsService` — before this method ever sees them) and
   * returns a scored similarity list. The caller wires the result to its own already-existing,
   * already-tested merge/link/reject actions — this method only ever finds and scores, never
   * merges or links anything itself. */
  async findSimilarIncidents(
    target: SimilarIncidentCandidateInput,
    candidates: SimilarIncidentCandidateInput[],
  ): Promise<SimilarIncidentResult[]> {
    if (candidates.length === 0) return [];
    const client = this.assertConfigured();

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
      model: this.model,
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
}
