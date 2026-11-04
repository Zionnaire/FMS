import { notFound } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import { getConfigurationKeyDetail } from "@/features/configuration/api";
import { CD_KEYS, type CdKey } from "@/features/configuration/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { RatifyForm, CreateDraftForm } from "./configuration-forms";

export default async function ConfigurationKeyPage(props: PageProps<"/configuration/[key]">) {
  const { key: keyParam } = await props.params;
  if (!(CD_KEYS as readonly string[]).includes(keyParam)) notFound();
  const key = keyParam as CdKey;

  const { accessToken } = await requireSession();
  const detail = await getConfigurationKeyDetail(accessToken, key);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">{key}</h1>
        {detail.current && <StatusBadge status={detail.current.status} tone={detail.current.status === "RATIFIED" ? "positive" : "warning"} />}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="border-outline-variant shadow-card">
          <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Current value {detail.current && `(v${detail.current.version})`}</CardTitle></CardHeader>
          <CardContent>
            {detail.current ? (
              <pre className="max-h-96 overflow-auto rounded-lg bg-surface-container-low p-3 text-xs whitespace-pre-wrap">{JSON.stringify(detail.current.value, null, 2)}</pre>
            ) : (
              <p className="text-xs text-on-surface-variant">No version exists yet for this tenant.</p>
            )}
            {detail.current && detail.current.status === "DRAFT" && (
              <RatifyForm cdKey={key} version={detail.current.version} />
            )}
          </CardContent>
        </Card>

        <Card className="border-outline-variant shadow-card">
          <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Create new draft</CardTitle></CardHeader>
          <CardContent>
            <CreateDraftForm
              cdKey={key}
              nextVersion={(detail.current?.version ?? 0) + 1}
              defaultValue={detail.current ? JSON.stringify(detail.current.value, null, 2) : "{}"}
            />
          </CardContent>
        </Card>
      </div>

      {detail.history.length > 1 && (
        <Card className="border-outline-variant shadow-card">
          <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Version history</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs">
              {detail.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-lg bg-surface-container-low p-2">
                  <span>v{h.version}</span>
                  <StatusBadge status={h.status} tone={h.status === "RATIFIED" ? "positive" : h.status === "SUPERSEDED" ? "neutral" : "warning"} />
                  <span className="text-on-surface-variant">{new Date(h.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
