import { requireSession } from "@/features/auth/session";
import { getEvidenceRegister } from "@/features/evidence/api";
import { EVIDENCE_CATEGORIES, type EvidenceCategory } from "@/features/evidence/types";
import { EvidenceTable } from "./evidence-table";

function isCategory(value: string | undefined): value is EvidenceCategory {
  return !!value && (EVIDENCE_CATEGORIES as readonly string[]).includes(value);
}

export default async function EvidencePage(props: PageProps<"/evidence">) {
  const searchParams = await props.searchParams;
  const category = isCategory(searchParams.category as string | undefined) ? (searchParams.category as EvidenceCategory) : undefined;
  const q = ((searchParams.q as string | undefined) || "").trim().toLowerCase();

  const { accessToken } = await requireSession();
  const allItems = await getEvidenceRegister(accessToken);

  const legalHoldCount = allItems.filter((i) => i.legalHold).length;
  const unverifiedCount = allItems.filter((i) => !i.custodyEvents?.some((e) => e.action === "HASH_VERIFIED")).length;
  const categoryCounts = Object.fromEntries(EVIDENCE_CATEGORIES.map((c) => [c, allItems.filter((i) => i.category === c).length])) as Record<EvidenceCategory, number>;

  const items = allItems
    .filter((i) => !category || i.category === category)
    .filter((i) => !q || i.title.toLowerCase().includes(q) || i.case.referenceCode.toLowerCase().includes(q) || i.case.title.toLowerCase().includes(q));

  const preserved = new URLSearchParams();
  if (q) preserved.set("q", q);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Evidence</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allItems.length} item{allItems.length === 1 ? "" : "s"} across every case you can access.
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Register size</span>
            <span className="material-symbols-outlined text-secondary-fixed">inventory_2</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-surface-bright">{allItems.length}</span>
            <span className="text-sm font-semibold text-on-primary-container">items</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Legal holds</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">gavel</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{legalHoldCount}</span>
            <span className="text-sm font-semibold text-on-surface">Under hold</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Chain of custody</span>
            <span className="rounded-xl bg-surface-container p-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-base">verified</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{unverifiedCount}</span>
            <span className="text-sm font-semibold text-on-surface">Not yet verified</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Categories</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">category</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{EVIDENCE_CATEGORIES.filter((c) => categoryCounts[c] > 0).length}</span>
            <span className="text-sm font-semibold text-on-surface">represented</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/evidence${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!category ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All categories <span className="ml-1 opacity-80">{allItems.length}</span>
          </a>
          {EVIDENCE_CATEGORIES.map((c) => (
            <a
              key={c}
              href={`/evidence?category=${c}${q ? `&${preserved.toString()}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${category === c ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {c.replaceAll("_", " ")} <span className="ml-1 opacity-80">{categoryCounts[c]}</span>
            </a>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/evidence">
          {category && <input type="hidden" name="category" value={category} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Title, case reference, or case title..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
            <a href="/evidence" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <EvidenceTable items={items} />
      </div>
    </>
  );
}
