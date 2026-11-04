import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown immediately while `(app)/page.tsx`'s backend calls are in flight — without this, the
 * browser shows a blank page for however long those calls take, which reads as "the app is
 * broken" rather than "the app is loading" (found live: a Neon connectivity hiccup made this
 * page take several seconds with nothing on screen at all).
 */
export default function DashboardLoading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-outline-variant p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </>
  );
}
