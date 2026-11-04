"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Overview", icon: "dashboard" },
  { href: "/approvals", label: "Approvals", icon: "gavel" },
  { href: "/investigations", label: "Investigations", icon: "policy" },
  { href: "/evidence", label: "Evidence", icon: "lock" },
  { href: "/containment", label: "Containment", icon: "shield" },
  { href: "/recovery", label: "Recovery", icon: "account_balance" },
  { href: "/capa", label: "CAPA", icon: "fact_check" },
  { href: "/regulatory", label: "Regulatory", icon: "balance" },
];

export function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  const base = `/cases/${caseId}`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-outline-variant/30">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              active ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
