import { requireSession } from "@/features/auth/session";
import { listTeams } from "@/features/teams/api";
import { CaseForm } from "./case-form";

export default async function NewCasePage() {
  const { accessToken } = await requireSession();
  const teams = await listTeams(accessToken);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">New case</h1>
        <p className="mt-1 text-xs text-on-surface-variant">Sensitivity is required — see the doc comment on why it&apos;s never auto-derived from a linked incident.</p>
      </div>
      <div className="max-w-xl rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <CaseForm teams={teams} />
      </div>
    </>
  );
}
