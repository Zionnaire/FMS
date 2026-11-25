import { EntityForm } from "./entity-form";

export default function NewEntityPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">New entity</h1>
        <p className="mt-1 text-xs text-on-surface-variant">A real-world party (person, company, or account) you can later link to cases and other entities.</p>
      </div>
      <div className="max-w-xl rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <EntityForm />
      </div>
    </div>
  );
}
