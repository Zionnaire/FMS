import { SignalForm } from "./signal-form";

export default function NewSignalPage() {
  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Log incident</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Files a Signal — an unvalidated report. A triage-role reviewer decides whether it becomes an Incident.
        </p>
      </div>
      <div className="max-w-xl rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <SignalForm />
      </div>
    </>
  );
}
