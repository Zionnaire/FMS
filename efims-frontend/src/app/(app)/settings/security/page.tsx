import { requireSession } from "@/features/auth/session";
import { getMfaStatus } from "@/features/auth/mfa-api";
import { SecurityMfaPanel } from "./security-mfa-panel";

/** Self-service account security — every authenticated role gets this page (see the topnav's own
 * shield-icon link), not just admins: a second factor only means something if the account holder
 * set it up themselves. TOTP (RFC 6238), opt-in, never forced — see `schema.prisma`'s own doc
 * comment on `User.mfaEnabled` for why. */
export default async function SecuritySettingsPage() {
  const { accessToken } = await requireSession();
  const status = await getMfaStatus(accessToken);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Security</h1>
        <p className="mt-1 text-xs text-on-surface-variant">Manage multi-factor authentication for your own account.</p>
      </div>

      <SecurityMfaPanel initialStatus={status} />
    </>
  );
}
