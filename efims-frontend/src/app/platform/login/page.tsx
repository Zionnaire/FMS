import type { Metadata } from "next";
import { PlatformLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Platform sign in — EFIMS",
};

/**
 * Deliberately NOT styled like `app/login/page.tsx`'s two-panel tenant login — no tenant-slug
 * field (a platform account isn't tied to a tenant at all), and a visually distinct, starker
 * single-panel layout so it's never ambiguous which login this is. Same spirit as the rest of
 * this area: same design tokens, intentionally different, simpler shell.
 */
export default function PlatformLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-inverse-surface px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-modal">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary">
            <span className="font-headline text-lg font-bold">E</span>
          </div>
          <div>
            <p className="font-headline text-lg font-semibold text-primary">EFIMS Platform</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">Super-admin access</p>
          </div>
        </div>
        <p className="mb-6 text-xs text-on-surface-variant">
          This is the cross-tenant platform console — not a bank tenant login. Looking for the regular EFIMS sign-in?{" "}
          <a href="/login" className="font-semibold text-primary underline underline-offset-2">
            Go there instead
          </a>
          .
        </p>
        <PlatformLoginForm />
      </div>
    </main>
  );
}
