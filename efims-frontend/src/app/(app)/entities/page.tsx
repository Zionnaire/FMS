import Link from "next/link";
import { Plus, Network, User, Building2, CreditCard, ShieldAlert } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listEntities } from "@/features/entities/api";
import type { EntityType } from "@/features/entities/types";
import { Badge } from "@/components/ui/badge";

const TYPE_ICON: Record<EntityType, typeof User> = { PERSON: User, COMPANY: Building2, ACCOUNT: CreditCard };

function isEntityType(value: string | undefined): value is EntityType {
  return value === "PERSON" || value === "COMPANY" || value === "ACCOUNT";
}

export default async function EntitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { accessToken } = await requireSession();
  const params = await searchParams;
  const type = isEntityType(params.type) ? params.type : undefined;
  const watchlisted = params.watchlisted === "true" ? true : undefined;

  const entities = await listEntities({ accessToken, type, watchlisted, search: params.q });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Entities</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            Real-world parties (people, companies, accounts) linked across cases. See a party&apos;s full web of
            connections in the <Link href="/network-graph" className="underline underline-offset-2">Network Graph</Link>.
          </p>
        </div>
        <Link
          href="/entities/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus size={14} strokeWidth={2.5} />
          New entity
        </Link>
      </div>

      <form className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <input
          type="text"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name…"
          className="min-w-[200px] flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
        <select name="type" defaultValue={type ?? ""} className="rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-xs">
          <option value="">All types</option>
          <option value="PERSON">Person</option>
          <option value="COMPANY">Company</option>
          <option value="ACCOUNT">Account</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <input type="checkbox" name="watchlisted" value="true" defaultChecked={watchlisted === true} />
          Watchlisted only
        </label>
        <button type="submit" className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:bg-surface-container">
          Filter
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-xs">
          <thead className="border-b border-outline-variant bg-surface-container text-[10px] font-bold tracking-wide text-on-surface-variant uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Entity</th>
              <th className="px-4 py-2.5 text-left">Type</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const Icon = TYPE_ICON[entity.type];
              return (
                <tr key={entity.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container">
                  <td className="px-4 py-2.5">
                    <Link href={`/entities/${entity.id}`} className="flex items-center gap-2 font-semibold text-primary hover:underline">
                      <Icon size={14} strokeWidth={2} className="shrink-0 text-on-surface-variant" />
                      {entity.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">{entity.type}</td>
                  <td className="px-4 py-2.5">
                    {entity.watchlisted ? (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert size={10} />
                        Watchlisted
                      </Badge>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">{new Date(entity.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
            {entities.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  <Network size={24} strokeWidth={1.5} className="mx-auto mb-2 opacity-40" />
                  No entities match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
