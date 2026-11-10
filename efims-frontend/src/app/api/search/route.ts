import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { listCases } from "@/features/cases/api";
import { listIncidents } from "@/features/incidents/api";
import { listSignals } from "@/features/signals/api";
import { listUsers } from "@/features/users/api";

export interface SearchResultItem {
  kind: "case" | "incident" | "signal" | "user";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Global Ctrl+K search — the command palette (a Client Component) can't call the `server-only`
 * `features/*\/api.ts` functions directly, so this Route Handler does the fan-out server-side and
 * returns one combined result list. Reuses the `q` filter every list endpoint already supports
 * (cases/incidents/signals — confirmed already built) plus a client-side-on-this-route substring
 * filter over `GET /users` (small, tenant-scoped lists, not worth a backend `q` param of its own).
 * No new search index — this is the "reuse what's there" MVP the plan called for.
 */
export async function GET(request: Request) {
  const { accessToken } = await requireSession();
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const [cases, incidents, signals, users] = await Promise.all([
    listCases({ accessToken, q, limit: 5 }),
    listIncidents({ accessToken, q, limit: 5 }),
    listSignals({ accessToken, q, limit: 5 }),
    listUsers(accessToken),
  ]);

  const results: SearchResultItem[] = [
    ...cases.cases.map((c) => ({
      kind: "case" as const,
      id: c.id,
      title: c.title,
      subtitle: c.referenceCode,
      href: `/cases/${c.id}`,
    })),
    ...incidents.incidents.map((i) => ({
      kind: "incident" as const,
      id: i.id,
      title: i.title,
      subtitle: i.referenceCode,
      href: `/incidents/${i.id}`,
    })),
    ...signals.signals.map((s) => ({
      kind: "signal" as const,
      id: s.id,
      title: s.summary,
      subtitle: s.source,
      href: `/signals/${s.id}`,
    })),
    ...users
      .filter((u) => u.fullName.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((u) => ({
        kind: "user" as const,
        id: u.id,
        title: u.fullName,
        subtitle: u.email,
        href: `/users/${u.id}`,
      })),
  ];

  return NextResponse.json({ results });
}
