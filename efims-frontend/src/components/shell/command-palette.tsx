"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResultItem } from "@/app/api/search/route";

const KIND_ICON: Record<SearchResultItem["kind"], string> = {
  case: "folder_managed",
  incident: "crisis_alert",
  signal: "flag",
  user: "person",
};
const KIND_LABEL: Record<SearchResultItem["kind"], string> = {
  case: "Case",
  incident: "Incident",
  signal: "Signal",
  user: "User",
};

/** Global Ctrl+K search — Vanguard Precision's "global quick-search" principle, previously absent
 * from this app entirely (no search box existed anywhere outside each list page's own
 * entity-scoped filter). Mounted once in the app shell layout; fans out to `/api/search`, which
 * itself reuses the existing `q`-filtered list endpoints rather than a new search index. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const openPalette = useCallback(() => {
    setQuery("");
    setResults([]);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) openPalette();
          return !v;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setResults(data.results ?? []);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const displayResults = query.trim().length < 2 ? [] : results;

  const select = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-container-low"
      >
        <span className="material-symbols-outlined text-[16px]">search</span>
        <span className="hidden sm:inline">Search cases, incidents, signals, users…</span>
        <span className="ml-2 rounded border border-outline-variant bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          Ctrl K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
              <span className="material-symbols-outlined text-on-surface-variant">search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cases, incidents, signals, users…"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted-foreground focus:outline-none"
              />
              {loading && <span className="material-symbols-outlined animate-spin text-[16px] text-muted-foreground">progress_activity</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {query.trim().length >= 2 && !loading && displayResults.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No results.</p>
              )}
              {displayResults.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  type="button"
                  onClick={() => select(r.href)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-container-low"
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{KIND_ICON[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-on-surface">{r.title}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.subtitle}</span>
                  </span>
                  <span className="shrink-0 rounded bg-surface-container-low px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {KIND_LABEL[r.kind]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
