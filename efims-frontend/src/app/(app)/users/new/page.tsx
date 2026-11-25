import { requireSession } from "@/features/auth/session";
import { UserForm } from "./user-form";

export default async function NewUserPage() {
  await requireSession();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">New user</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Set a temporary password and share it with the new user directly. They&apos;ll use it to sign in.
        </p>
      </div>
      <div className="max-w-xl rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <UserForm />
      </div>
    </>
  );
}
