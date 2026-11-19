"use client";

import { Printer } from "lucide-react";

/** Honest naming matters here: this triggers the browser's own print dialog (which any browser
 * can "print to PDF" from) — it is NOT a "Submit"/"Transmit" action. Nothing in this codebase
 * sends this document to any regulator system; a human prints or saves it, then files it
 * through whatever real channel the regulator actually provides. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow-card transition-colors hover:bg-primary/90 print:hidden"
    >
      <Printer size={14} strokeWidth={2} />
      Print / Save as PDF
    </button>
  );
}
