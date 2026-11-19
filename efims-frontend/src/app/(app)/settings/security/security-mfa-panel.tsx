"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import type { MfaStatus } from "@/features/auth/mfa-api";
import { confirmMfaEnrollmentAction, disableMfaAction, startMfaEnrollmentAction, type EnrollStartResult } from "@/features/auth/mfa-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type View =
  | { step: "idle"; enabled: boolean; enrolledAt: string | null }
  | { step: "enrolling"; enrollment: EnrollStartResult; error?: string }
  | { step: "backup-codes"; backupCodes: string[] }
  | { step: "disabling"; error?: string };

/** Click-to-start, nothing auto-enabled — mirrors the rest of this app's "advisory panels never
 * act on their own" interaction shape, just applied to an account-security flow instead of an AI
 * suggestion. Three real states, one real security property each: enrolling shows a QR code plus
 * the raw secret (manual-entry fallback for a desktop-only authenticator), confirming requires a
 * real code from the app the secret was just scanned into (proves the user actually captured it),
 * and the backup codes are shown exactly once — this component never re-fetches or re-displays
 * them, matching the backend's own "hash immediately, never store recoverable" posture. */
export function SecurityMfaPanel({ initialStatus }: { initialStatus: MfaStatus }) {
  const [view, setView] = useState<View>({ step: "idle", enabled: initialStatus.enabled, enrolledAt: initialStatus.enrolledAt });
  const [pending, setPending] = useState(false);

  async function handleStartEnrollment() {
    setPending(true);
    const result = await startMfaEnrollmentAction();
    setPending(false);
    if (result.error || !result.data) {
      setView({ step: "idle", enabled: false, enrolledAt: null });
      return;
    }
    setView({ step: "enrolling", enrollment: result.data });
  }

  async function handleConfirm(formData: FormData) {
    if (view.step !== "enrolling") return;
    setPending(true);
    const code = String(formData.get("code") ?? "");
    const result = await confirmMfaEnrollmentAction(code);
    setPending(false);
    if (result.error) {
      setView({ ...view, error: result.error });
      return;
    }
    setView({ step: "backup-codes", backupCodes: result.backupCodes ?? [] });
  }

  async function handleDisable(formData: FormData) {
    setPending(true);
    const password = String(formData.get("password") ?? "");
    const result = await disableMfaAction(password);
    setPending(false);
    if (result.error) {
      setView({ step: "disabling", error: result.error });
      return;
    }
    setView({ step: "idle", enabled: false, enrolledAt: null });
  }

  function acknowledgeBackupCodes() {
    setView({ step: "idle", enabled: true, enrolledAt: new Date().toISOString() });
  }

  if (view.step === "backup-codes") {
    return (
      <div className="max-w-xl rounded-xl border border-tertiary/40 bg-tertiary-container/15 p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm font-bold text-tertiary">
          <KeyRound size={18} strokeWidth={2} />
          Save your backup codes now
        </div>
        <p className="mt-1.5 text-xs text-on-surface-variant">
          Each code works once, if you lose access to your authenticator app. They will never be shown again after you leave this page.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {view.backupCodes.map((code) => (
            <div key={code} data-testid="mfa-backup-code" className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-center text-on-surface">
              {code}
            </div>
          ))}
        </div>
        <Button type="button" className="mt-5 w-full" onClick={acknowledgeBackupCodes}>
          I&apos;ve saved these — done
        </Button>
      </div>
    );
  }

  if (view.step === "enrolling") {
    return (
      <div className="max-w-xl rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <ShieldCheck size={18} strokeWidth={2} className="text-tertiary" />
          Scan this QR code
        </div>
        <p className="mt-1.5 text-xs text-on-surface-variant">
          Use any TOTP authenticator app (Google Authenticator, Authy, 1Password, etc.). Can&apos;t scan? Enter the key below manually.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a base64 data: URL rendered once, not an optimizable remote image */}
        <img src={view.enrollment.qrCodeDataUrl} alt="MFA enrollment QR code" className="mx-auto mt-4 h-48 w-48 rounded-lg border border-outline-variant/40" />
        <div data-testid="mfa-secret" className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 font-mono text-xs text-on-surface-variant">
          {view.enrollment.secret}
          <CopyButton value={view.enrollment.secret} />
        </div>

        <form action={handleConfirm} className="mt-5 space-y-3">
          <div>
            <Label htmlFor="code" className="mb-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Enter the 6-digit code to confirm
            </Label>
            <Input id="code" name="code" placeholder="123456" maxLength={6} autoFocus />
          </div>
          {view.error && <p className="text-xs text-error">{view.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Confirming…" : "Confirm and enable MFA"}
          </Button>
        </form>
      </div>
    );
  }

  if (view.step === "disabling") {
    return (
      <div className="max-w-xl rounded-xl border border-error/30 bg-error-container/15 p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm font-bold text-on-error-container">
          <AlertTriangle size={18} strokeWidth={2} />
          Disable MFA
        </div>
        <p className="mt-1.5 text-xs text-on-surface-variant">Re-enter your password to confirm — this removes your backup codes too.</p>
        <form action={handleDisable} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="password" className="mb-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Password
            </Label>
            <Input id="password" name="password" type="password" autoFocus />
          </div>
          {view.error && <p className="text-xs text-error">{view.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Disabling…" : "Disable MFA"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setView({ step: "idle", enabled: true, enrolledAt: null })}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-xl rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
          {view.enabled ? <ShieldCheck size={18} strokeWidth={2} className="text-tertiary" /> : <ShieldOff size={18} strokeWidth={2} className="text-on-surface-variant" />}
          Multi-factor authentication
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${view.enabled ? "bg-tertiary-container text-tertiary" : "bg-surface-container text-on-surface-variant"}`}>
          {view.enabled ? "Enabled" : "Not enabled"}
        </span>
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">
        {view.enabled
          ? "A 6-digit code from your authenticator app is required every time you sign in, in addition to your password."
          : "Add a second step at sign-in using an authenticator app on your phone or computer."}
      </p>
      {view.enabled ? (
        <Button type="button" variant="outline" className="mt-4 gap-1.5" onClick={() => setView({ step: "disabling" })}>
          <ShieldOff size={14} strokeWidth={2} />
          Disable MFA
        </Button>
      ) : (
        <Button type="button" className="mt-4 gap-1.5" disabled={pending} onClick={handleStartEnrollment}>
          <ShieldCheck size={14} strokeWidth={2} />
          {pending ? "Starting…" : "Enable MFA"}
        </Button>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-on-surface-variant hover:text-on-surface"
      aria-label="Copy secret key"
    >
      {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
    </button>
  );
}
