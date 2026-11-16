"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Gavel, ShieldCheck, Lock, ShieldAlert, Landmark, ClipboardCheck, Scale, type LucideIcon } from "lucide-react";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/approvals", label: "Approvals", icon: Gavel },
  { href: "/investigations", label: "Investigations", icon: ShieldCheck },
  { href: "/evidence", label: "Evidence", icon: Lock },
  { href: "/containment", label: "Containment", icon: ShieldAlert },
  { href: "/recovery", label: "Recovery", icon: Landmark },
  { href: "/capa", label: "CAPA", icon: ClipboardCheck },
  { href: "/regulatory", label: "Regulatory", icon: Scale },
];

export function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  const base = `/cases/${caseId}`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-outline-variant/30">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              active ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-variant hover:text-tertiary"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
