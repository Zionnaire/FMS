import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getConfigurationKeyDetail } from "@/features/configuration/api";
import { CD_KEYS, type CdKey, type ConfigurationEntry } from "@/features/configuration/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RatifyForm, CreateDraftForm } from "./configuration-forms";

function ValueCard({ title, entry }: { title: string; entry: ConfigurationEntry | null }) {
  return (
    <Card className="border-outline-variant shadow-card">
      <CardHeader><CardTitle className="text-sm font-bold text-on-surface">{title} {entry && `(v${entry.version})`}</CardTitle></CardHeader>
      <CardContent>
        {entry ? (
          <pre className="max-h-96 overflow-auto rounded-lg bg-surface-container-low p-3 text-xs whitespace-pre-wrap">{JSON.stringify(entry.value, null, 2)}</pre>
        ) : (
          <p className="text-xs text-on-surface-variant">None yet for this tenant.</p>
        )}
      </CardContent>
    </Card>
  );
}

type DiffRow = { key: string; kind: "added" | "removed" | "changed" | "same"; before: unknown; after: unknown };

function diffValues(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): DiffRow[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].sort().map((key) => {
    const hasBefore = !!before && key in before;
    const hasAfter = !!after && key in after;
    const b = before?.[key];
    const a = after?.[key];
    let kind: DiffRow["kind"];
    if (!hasBefore && hasAfter) kind = "added";
    else if (hasBefore && !hasAfter) kind = "removed";
    else if (JSON.stringify(b) !== JSON.stringify(a)) kind = "changed";
    else kind = "same";
    return { key, kind, before: b, after: a };
  });
}

function formatCell(v: unknown): string {
  if (v === undefined) return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

const DIFF_TONE: Record<DiffRow["kind"], string> = {
  added: "text-tertiary",
  removed: "text-error",
  changed: "text-secondary",
  same: "text-on-surface-variant",
};

export default async function ConfigurationKeyPage(props: PageProps<"/configuration/[key]">) {
  const { key: keyParam } = await props.params;
  if (!(CD_KEYS as readonly string[]).includes(keyParam)) notFound();
  const key = keyParam as CdKey;

  const { accessToken } = await requireSession();
  const detail = await getConfigurationKeyDetail(accessToken, key);

  const isUnratified = !detail.current || detail.current.status !== "RATIFIED";
  const baseline = detail.history
    .filter((h) => h.status === "RATIFIED")
    .sort((a, b) => b.version - a.version)[0] ?? null;
  const proposedAmendment = detail.current && detail.current.status !== "RATIFIED" ? detail.current : null;
  const diffRows = baseline || proposedAmendment ? diffValues(baseline?.value, proposedAmendment?.value ?? baseline?.value) : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-on-surface">{key}</h1>
        {detail.current && <StatusBadge status={detail.current.status} tone={detail.current.status === "RATIFIED" ? "positive" : "warning"} />}
        {isUnratified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-2.5 py-1 text-[11px] font-bold text-on-secondary-container">
            <Clock size={14} strokeWidth={2} />
            Unratified, working default only
          </span>
        )}
      </div>

      <Tabs defaultValue="baseline">
        <TabsList variant="line">
          <TabsTrigger value="baseline">Baseline</TabsTrigger>
          <TabsTrigger value="proposed">Proposed amendment</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="baseline" className="pt-4">
          <ValueCard title="Ratified baseline" entry={baseline} />
        </TabsContent>

        <TabsContent value="proposed" className="flex flex-col gap-5 pt-4 lg:flex-row">
          <div className="flex-1">
            <ValueCard title="Proposed amendment" entry={proposedAmendment} />
            {proposedAmendment && (
              <div className="mt-3">
                <RatifyForm cdKey={key} version={proposedAmendment.version} />
              </div>
            )}
          </div>
          <Card className="flex-1 border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Create new draft</CardTitle></CardHeader>
            <CardContent>
              <CreateDraftForm
                cdKey={key}
                nextVersion={(detail.current?.version ?? 0) + 1}
                defaultValue={detail.current ? JSON.stringify(detail.current.value, null, 2) : "{}"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="pt-4">
          <Card className="border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Baseline vs. proposed amendment</CardTitle></CardHeader>
            <CardContent>
              {!baseline && !proposedAmendment ? (
                <p className="text-xs text-on-surface-variant">No ratified baseline or proposed amendment exists yet for this tenant.</p>
              ) : !proposedAmendment ? (
                <p className="text-xs text-on-surface-variant">No pending amendment. The current value is already the ratified baseline.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-left text-[11px] font-semibold text-on-surface-variant uppercase">
                      <th className="py-2 pr-3">Field</th>
                      <th className="py-2 pr-3">Baseline</th>
                      <th className="py-2">Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.map((row) => (
                      <tr key={row.key} className="border-b border-outline-variant/10">
                        <td className={`py-2 pr-3 font-semibold ${DIFF_TONE[row.kind]}`}>{row.key}</td>
                        <td className="py-2 pr-3 text-on-surface-variant">{formatCell(row.before)}</td>
                        <td className={`py-2 ${DIFF_TONE[row.kind]}`}>{formatCell(row.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card className="border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Version history</CardTitle></CardHeader>
            <CardContent>
              {detail.history.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No versions exist yet for this tenant.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {detail.history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between rounded-lg bg-surface-container-low p-2">
                      <span>v{h.version}</span>
                      <StatusBadge status={h.status} tone={h.status === "RATIFIED" ? "positive" : h.status === "SUPERSEDED" ? "neutral" : "warning"} />
                      <span className="text-on-surface-variant">{new Date(h.createdAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
