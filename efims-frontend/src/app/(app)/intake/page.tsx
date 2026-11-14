import Link from "next/link";
import { SignalsPageContent } from "../signals/page";
import { IncidentsPageContent } from "../incidents/page";

const TABS = [
  { key: "signals", label: "Signals" },
  { key: "incidents", label: "Incidents" },
] as const;

type IntakeTab = (typeof TABS)[number]["key"];

function isIntakeTab(value: string | undefined): value is IntakeTab {
  return value === "signals" || value === "incidents";
}

/** One nav item (`/intake`) in front of two already-substantial, already-good pages
 * (`/signals`, `/incidents`) — no data-fetching changes, this just renders each page's own
 * exported content as a tab panel. `/signals` and `/incidents` keep working unchanged for
 * existing deep links; interacting with a filter/pagination control inside a tab here
 * navigates to that page's own dedicated route (its hrefs are unchanged), which is the
 * intended, lowest-risk behavior — this page is a switcher/landing point, not a rewrite of
 * either page's internals. */
export default async function IntakePage(props: PageProps<"/intake">) {
  const searchParams = await props.searchParams;
  const tab = isIntakeTab(searchParams.tab as string | undefined) ? (searchParams.tab as IntakeTab) : "signals";

  return (
    <>
      <div className="flex gap-2 border-b border-outline-variant/40 pb-0">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/intake?tab=${t.key}`}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "signals" ? await SignalsPageContent(searchParams) : await IncidentsPageContent(searchParams)}
    </>
  );
}
