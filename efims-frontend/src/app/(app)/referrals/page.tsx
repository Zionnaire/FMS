import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { listCases } from "@/features/cases/api";
import { listTeams } from "@/features/teams/api";
import type { Compartment } from "@/features/auth/types";
import { CasesTable } from "../cases/cases-table";

const TABS: { compartment: Compartment; label: string }[] = [
  { compartment: "HR", label: "HR" },
  { compartment: "LEGAL_PRIVILEGE", label: "Legal privilege" },
];

function isTabCompartment(value: string | undefined): value is Compartment {
  return value === "HR" || value === "LEGAL_PRIVILEGE";
}

export default async function ReferralsPage(props: PageProps<"/referrals">) {
  const searchParams = await props.searchParams;
  const compartment = isTabCompartment(searchParams.compartment as string | undefined) ? (searchParams.compartment as Compartment) : "HR";

  const { accessToken } = await requireSession();
  const [{ cases, total }, teams] = await Promise.all([
    listCases({ accessToken, compartment, limit: 100 }),
    listTeams(accessToken),
  ]);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">HR &amp; legal referrals</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Cases compartmented to HR or Legal Privilege — visible only to roles with that compartment grant, enforced by the backend&apos;s own
          7-condition access rule, not by this tab.
        </p>
      </div>

      <div className="flex gap-2 border-b border-outline-variant/40 pb-0">
        {TABS.map((tab) => (
          <Link
            key={tab.compartment}
            href={`/referrals?compartment=${tab.compartment}`}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              compartment === tab.compartment
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/20 bg-surface-container-low/40 px-5 py-3 text-xs text-on-surface-variant">
          {total} case{total === 1 ? "" : "s"} in {TABS.find((t) => t.compartment === compartment)?.label}
        </div>
        <CasesTable cases={cases} teams={teams} />
      </div>
    </>
  );
}
