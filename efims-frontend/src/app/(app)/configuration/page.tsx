import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { getAllCurrentConfiguration } from "@/features/configuration/api";
import { CD_KEYS } from "@/features/configuration/types";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";

export default async function ConfigurationPage() {
  const { accessToken } = await requireSession();
  const current = await getAllCurrentConfiguration(accessToken);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Configuration</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          CD-01 through CD-08 are the platform&apos;s configuration decisions. These are working defaults, not yet formally ratified policy.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CD_KEYS.map((key) => {
          const entry = current[key];
          return (
            <Link key={key} href={`/configuration/${key}`}>
              <Card className="border-outline-variant shadow-card transition-shadow hover:shadow-hover">
                <CardContent className="flex items-center justify-between pt-4">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{key}</p>
                    {entry && <p className="text-xs text-on-surface-variant">v{entry.version}</p>}
                  </div>
                  {entry ? (
                    <StatusBadge status={entry.status} tone={entry.status === "RATIFIED" ? "positive" : "warning"} />
                  ) : (
                    <StatusBadge status="NOT SET" tone="neutral" />
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
