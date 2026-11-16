"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Vanguard Precision's "Case Dossier Inspector" slide-over pattern — a right-side panel at
 * 480/640px with a structural left border and sticky header, opened as a progressive enhancement
 * on top of an existing full-page route (never a replacement for it: the full route keeps working
 * unchanged for direct links/bookmarks). Scoped to Cases first per the plan; Incidents/Signals get
 * the same shell as a fast-follow once this is proven. */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  width = "480px",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "480px" | "640px";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-drawer-title"
        className="relative flex h-full max-w-[90vw] flex-col border-l border-outline-variant bg-surface-container-lowest shadow-drawer"
        style={{ width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0">
            {subtitle && <p className="truncate font-mono text-[11px] font-medium text-on-surface-variant">{subtitle}</p>}
            <h2 id="detail-drawer-title" className="truncate text-base font-semibold text-on-surface">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-outline-variant px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
