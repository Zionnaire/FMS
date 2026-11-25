import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | EFIMS Core",
};

/**
 * Styled after `mockups/screens/login-mfa.html`'s two-panel layout (dark spruce info rail +
 * light auth card) — but deliberately without that mockup's FIDO2/YubiKey/hardware-key MFA
 * flow. The real `identity` backend module is single-factor (email + password + tenant slug);
 * building a second-factor UI with no backend behind it would be security theater, not a
 * feature, so this page only implements what the backend actually does. See the frontend
 * README's own note on this adaptation.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-outline-variant shadow-modal md:grid-cols-5">
        <section className="flex flex-col justify-between gap-6 bg-primary-container p-8 text-on-primary md:col-span-2">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary text-on-tertiary">
                <ShieldCheck size={22} strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-xl font-bold">EFIMS Core</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-on-primary-container">
                  Financial Crime & Incident Orchestration
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-on-primary/80">
              Access is restricted to authorized personnel of the tenant bank named at sign-in. Every action taken in
              this system is written to an append-only audit ledger.
            </p>
          </div>
          <p className="font-mono text-[10px] text-on-primary/50">
            AI-assisted suggestions in this system are advisory only; a human always makes the final decision.
          </p>
        </section>

        <section className="col-span-1 bg-surface-container-lowest p-8 md:col-span-3">
          <h1 className="text-2xl font-bold text-on-surface">Sign in</h1>
          <p className="mt-1 mb-6 text-xs text-on-surface-variant">Enter your tenant, email, and password.</p>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
