"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Flag } from "lucide-react";
import type { AnomalySuggestion } from "@/features/ml-gateway/types";
import { ACCOUNT_RISK_RATINGS, TRANSACTION_CHANNELS, TRANSACTION_TYPES, VELOCITY_INDICATORS } from "@/features/ml-gateway/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

interface FormValues {
  transactionId: string;
  amountNgn: string;
  channel: string;
  transactionType: string;
  velocityIndicator: string;
  ipRiskScore: string;
  deviceRiskScore: string;
  isReversal: boolean;
  isChargeback: boolean;
  accountRiskRating: string;
}

const EMPTY: FormValues = {
  transactionId: "",
  amountNgn: "",
  channel: "",
  transactionType: "",
  velocityIndicator: "",
  ipRiskScore: "0",
  deviceRiskScore: "0",
  isReversal: false,
  isChargeback: false,
  accountRiskRating: "",
};

/** Click-to-fetch, never auto-fills anything, disclaimer always shown — same interaction shape
 * as the existing `SeveritySuggestionPanel`. A standalone one-off tool, not tied to any case or
 * incident, so this is a plain client fetch to a Next.js route handler, not a server action with
 * `revalidatePath` (there's nothing to revalidate). */
export function TransactionRiskScoringForm() {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [state, setState] = useState<{ loading: boolean; result: AnomalySuggestion | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  });

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true, result: null, error: null });
    try {
      const res = await fetch("/api/ml-gateway/anomaly-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: values.transactionId,
          amountNgn: Number(values.amountNgn),
          channel: values.channel,
          transactionType: values.transactionType,
          velocityIndicator: values.velocityIndicator,
          ipRiskScore: Number(values.ipRiskScore),
          deviceRiskScore: Number(values.deviceRiskScore),
          isReversal: values.isReversal,
          isChargeback: values.isChargeback,
          accountRiskRating: values.accountRiskRating,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ loading: false, result: null, error: data.error ?? "Unable to score this transaction right now." });
        return;
      }
      setState({ loading: false, result: data, error: null });
    } catch {
      setState({ loading: false, result: null, error: "Unable to reach the AI scoring service." });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="border-outline-variant shadow-card">
        <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Transaction details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Transaction ID</Label>
                <Input value={values.transactionId} onChange={(e) => set("transactionId", e.target.value)} required />
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Amount (NGN)</Label>
                <Input type="number" min={0} step="0.01" value={values.amountNgn} onChange={(e) => set("amountNgn", e.target.value)} required />
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Channel</Label>
                <Select value={values.channel} onValueChange={(v) => set("channel", v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Transaction type</Label>
                <Select value={values.transactionType} onValueChange={(v) => set("transactionType", v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Velocity indicator</Label>
                <Select value={values.velocityIndicator} onValueChange={(v) => set("velocityIndicator", v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select velocity" /></SelectTrigger>
                  <SelectContent>
                    {VELOCITY_INDICATORS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Account risk rating</Label>
                <Select value={values.accountRiskRating} onValueChange={(v) => set("accountRiskRating", v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select rating" /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_RISK_RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">IP risk score (0–1)</Label>
                <Input type="number" min={0} max={1} step="0.01" value={values.ipRiskScore} onChange={(e) => set("ipRiskScore", e.target.value)} required />
              </div>
              <div>
                <Label className="text-[11px] text-on-surface-variant uppercase">Device risk score (0–1)</Label>
                <Input type="number" min={0} max={1} step="0.01" value={values.deviceRiskScore} onChange={(e) => set("deviceRiskScore", e.target.value)} required />
              </div>
            </div>
            <div className="flex items-center gap-4 pt-1 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={values.isReversal} onChange={(e) => set("isReversal", e.target.checked)} />
                Is reversal
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={values.isChargeback} onChange={(e) => set("isChargeback", e.target.checked)} />
                Is chargeback
              </label>
            </div>
            <SubmitButton size="sm" pendingText="Scoring…">Score transaction</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="border-outline-variant shadow-card">
        <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Advisory result</CardTitle></CardHeader>
        <CardContent>
          {!state.result && !state.loading && !state.error && (
            <p className="text-xs text-on-surface-variant">Submit the form to get an advisory risk score.</p>
          )}
          {state.loading && <p className="text-xs text-on-surface-variant">Asking the model…</p>}
          {state.error && <p className="text-xs text-error">{state.error}</p>}
          {state.result && (
            <div className="space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                    state.result.isSuspicious ? "bg-error-container text-on-error-container" : "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                  }`}
                >
                  {state.result.isSuspicious ? <AlertTriangle size={14} strokeWidth={2} /> : <BadgeCheck size={14} strokeWidth={2} />}
                  {Math.round(state.result.anomalyScore * 100)}% anomaly score
                </span>
                {state.result.isSuspicious && <span className="font-semibold text-error">Suspicious</span>}
              </div>
              {state.result.requiresHumanReview && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-error">
                  <Flag size={12} strokeWidth={2} />
                  Flagged for human review.
                </p>
              )}
              {state.result.behaviouralSignals.length > 0 && (
                <ul className="list-disc space-y-1 pl-4 text-on-surface">
                  {state.result.behaviouralSignals.map((s) => <li key={s}>{s}</li>)}
                </ul>
              )}
              <p className="border-t border-outline-variant/30 pt-2 text-[11px] text-on-surface-variant">{state.result.disclaimer}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
