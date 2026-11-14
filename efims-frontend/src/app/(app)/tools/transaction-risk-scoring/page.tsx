import { TransactionRiskScoringForm } from "./transaction-risk-scoring-form";

export default function TransactionRiskScoringPage() {
  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Transaction risk scoring</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          A standalone investigative tool — the EFIMS AI Service&apos;s transaction anomaly scorer. Not tied to any
          case or incident; enter a transaction&apos;s details to get an advisory risk score.
        </p>
      </div>
      <TransactionRiskScoringForm />
    </>
  );
}
