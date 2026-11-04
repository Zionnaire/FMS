import { Skeleton } from "@/components/ui/skeleton";

/** See `(app)/loading.tsx`'s doc comment — same fix, this page's own real backend call. */
export default function IncidentsLoading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-2 rounded-2xl border border-outline-variant p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </>
  );
}
