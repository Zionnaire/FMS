import Link from "next/link";
import { getAllCurrentConfiguration } from "@/features/configuration/api";
import { CD_KEYS } from "@/features/configuration/types";

/** Site-wide banner while any CD-01..08 item is unratified (non-negotiable #9: these are working
 * defaults for build purposes, never to be represented to a bank, regulator, or stakeholder as
 * signed off). Shown to every authenticated role, not just Configuration roles — misrepresenting
 * ratification status is everyone's concern, not just the owning function's. `GET /configuration`
 * itself carries no `@Roles()` gate, so this is safe to call for any viewer. */
export async function UnratifiedConfigurationBanner({ accessToken }: { accessToken: string }) {
  const all = await getAllCurrentConfiguration(accessToken);
  const unratifiedCount = CD_KEYS.filter((key) => all[key]?.status !== "RATIFIED").length;
  if (unratifiedCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-secondary/30 bg-secondary-container/60 px-8 py-2 text-xs font-semibold text-on-secondary-container">
      <span className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">pending</span>
        {unratifiedCount} of {CD_KEYS.length} configuration decisions (CD-01–08) are working defaults, not yet formally ratified policy.
      </span>
      <Link href="/configuration" className="underline hover:no-underline">Review</Link>
    </div>
  );
}
