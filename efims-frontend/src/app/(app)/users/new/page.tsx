import { requireSession } from "@/features/auth/session";
import { UserForm } from "./user-form";

export default async function NewUserPage() {
  await requireSession();

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">New user</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Issues a temporary password directly — a real invite-link flow is a known follow-up, not built yet.
        </p>
      </div>
      <div className="max-w-xl rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <UserForm />
      </div>
    </>
  );
}
