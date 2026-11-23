"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Radio, AlertTriangle, Radar, Briefcase, FileSearch, Archive, ShieldAlert,
  Landmark, Wrench, Gavel, FileText, CheckSquare, Bell, FolderLock, EyeOff, Settings,
  Plug, Clock, Users, ShieldCheck, HeartPulse, ChevronRight, ChevronDown, X, Network, Fingerprint, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { ROLES, type Role } from "@/features/auth/types";
import { useMobileNav } from "./mobile-nav-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see this item — omit to show to everyone authenticated. */
  roles?: Role[];
  /** One level of sub-items (Configuration's sub-nav) — rendered indented under the parent, parent
   * itself still links to its own href (its first/overview sub-page). */
  children?: NavItem[];
}

/** Every role except Incident Reporter — "own reports only, no enterprise case browsing" per the
 * role brief this expansion is built from (docs/CHANGELOG.md's dated entry). The sidenav gate is
 * UX convenience only, same as every other role check in this frontend — the backend's own
 * access control (7-condition case-access rule, compartment grants, `@Roles()`) is what actually
 * enforces anything; a role not seeing a link here that still navigated to it directly would get
 * exactly the same backend-filtered result either way. */
const EXCEPT_REPORTER: Role[] = ROLES.filter((r) => r !== "INCIDENT_REPORTER");

/** Oversight roles — mirrors the backend's own `AUDIT_READ_ROLES` constant
 * (`common/constants/roles.ts`). */
const AUDIT_READ_ROLES: Role[] = ["TEAM_LEAD", "FRAUD_RISK_MANAGER", "COMPLIANCE_MLRO", "LEGAL_COUNSEL", "EXECUTIVE", "AUDITOR", "CONFIG_ADMIN", "ADMIN"];

/** Governance roles — mirrors the backend's own `CONFIG_ROLES` constant. */
const CONFIG_ROLES: Role[] = ["ADMIN", "EXECUTIVE", "CONFIG_ADMIN"];

/** `POST /users` and the whole access-change maker-checker flow are `ADMIN`-only (see
 * `access-change.controller.ts`'s own doc comment: deliberately not widened to `CONFIG_ADMIN` or
 * any business role). `GET /users` itself is open to everyone, but there's nothing for a
 * non-admin to do on this page, so the nav item stays `ADMIN`-only like every other gate here. */
const USER_MANAGEMENT_ROLES: Role[] = ["ADMIN"];

/** Compartment-aware nav gates (UX convenience only, same disclaimer as every other role check in
 * this file — the backend's own compartment-filtered `getVisibleCases`/`getVisibleIncidents` is
 * what actually enforces visibility; a role not seeing a link here that still navigated to it
 * directly would get exactly the same backend-filtered, possibly-empty result either way). Mirrors
 * each role's static compartment grant in `prisma/seed.ts`'s `ROLE_USERS`. */
const HR_LEGAL_REFERRAL_ROLES: Role[] = ["HR_REVIEWER", "LEGAL_COUNSEL", "AUDITOR", "ADMIN"];
const PROTECTED_DISCLOSURE_ROLES: Role[] = ["PROTECTED_DISCLOSURE_OFFICER", "AUDITOR", "ADMIN"];

/** Settings > Retention & Legal Holds — `CONFIG_ROLES` (this is a governance/settings surface)
 * plus the two roles who actually set/review legal holds day to day, mirroring the backend's own
 * `LEGAL_HOLD_ROLES` constant (`common/constants/roles.ts`). */
const RETENTION_ROLES: Role[] = [...CONFIG_ROLES, "LEGAL_COUNSEL", "COMPLIANCE_MLRO"];

interface NavSection {
  label: string;
  items: NavItem[];
}

/** Monitor/Manage/Govern/Administration — regrouped 2026-11-14 against the Institutional
 * Intelligence reference image, which splits "understand what's happening" (Signals, Incidents,
 * Intelligence) from "investigate and resolve" (Cases, Investigations, Evidence, Containment,
 * Recovery, CAPA) more precisely than the prior grouping did (Cases/Investigations/Evidence had
 * been sitting under Monitor). `/signals` and `/incidents` are real, substantial pages that
 * already existed — `/intake` (the tabbed switcher in front of both) stays working for existing
 * deep links but is no longer the nav entry point, since linking each page directly is more
 * precise. `/remediation`'s nav label changes to "CAPA" to match what the backend module and the
 * reference both actually call it. No route was removed — every previously-linked page is still
 * reachable, several (`/signals`, `/incidents`, `/notifications`) gained a *more* direct link than
 * they had before. */
const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: Home },
      { href: "/signals", label: "Signals", icon: Radio, roles: EXCEPT_REPORTER },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle, roles: EXCEPT_REPORTER },
      { href: "/tools/transaction-risk-scoring", label: "Intelligence", icon: Radar, roles: EXCEPT_REPORTER },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/cases", label: "Cases", icon: Briefcase, roles: EXCEPT_REPORTER },
      { href: "/investigations", label: "Investigations", icon: FileSearch, roles: EXCEPT_REPORTER },
      { href: "/evidence", label: "Evidence", icon: Archive, roles: EXCEPT_REPORTER },
      { href: "/containment", label: "Containment", icon: ShieldAlert, roles: EXCEPT_REPORTER },
      { href: "/recovery", label: "Recovery", icon: Landmark, roles: EXCEPT_REPORTER },
      { href: "/remediation", label: "CAPA", icon: Wrench, roles: EXCEPT_REPORTER },
      { href: "/entities", label: "Entities", icon: Fingerprint, roles: EXCEPT_REPORTER },
      { href: "/network-graph", label: "Network Graph", icon: Network, roles: EXCEPT_REPORTER },
    ],
  },
  {
    label: "Govern",
    items: [
      { href: "/regulatory", label: "Regulatory", icon: Gavel, roles: AUDIT_READ_ROLES },
      { href: "/audit", label: "Audit", icon: FileText, roles: AUDIT_READ_ROLES },
      { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: EXCEPT_REPORTER },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/referrals", label: "HR & legal referrals", icon: FolderLock, roles: HR_LEGAL_REFERRAL_ROLES },
      { href: "/whistleblowing", label: "Protected disclosures", icon: EyeOff, roles: PROTECTED_DISCLOSURE_ROLES },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users & Teams", icon: Users, roles: USER_MANAGEMENT_ROLES },
      {
        href: "/configuration",
        label: "Configuration",
        icon: Settings,
        roles: CONFIG_ROLES,
        children: [
          { href: "/settings/integrations", label: "Integrations", icon: Plug, roles: CONFIG_ROLES },
          { href: "/settings/retention", label: "Retention & legal holds", icon: Clock, roles: RETENTION_ROLES },
          { href: "/settings/system-health", label: "System health", icon: HeartPulse, roles: CONFIG_ROLES },
        ],
      },
    ],
  },
];

function NavLink({ item, pathname, indent }: { item: NavItem; pathname: string; indent?: boolean }) {
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-medium transition-colors ${
        indent ? "py-2 text-[11px]" : ""
      } ${
        active
          ? "bg-tertiary text-on-tertiary shadow-sm"
          : "text-on-primary-container hover:bg-primary-container hover:text-on-primary"
      }`}
    >
      <Icon size={indent ? 16 : 18} strokeWidth={2} className="shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function SideNav({ role, institutionName = "Bank 1" }: { role: Role; institutionName?: string }) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { open: mobileOpen, close } = useMobileNav();

  return (
    <>
      {/* Overlay — mobile/tablet only (below `lg`), dismisses the off-canvas sidebar on tap. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[1px] lg:hidden" onClick={close} aria-hidden="true" />
      )}
      <aside
        className={`fixed top-0 left-0 z-40 flex h-screen w-64 flex-col justify-between overflow-y-auto bg-primary p-4 text-on-primary shadow-hero transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tertiary text-on-tertiary">
            <ShieldCheck size={20} strokeWidth={2.25} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-on-primary">EFIMS</span>
            <span className="text-[10px] leading-tight text-on-primary-container">Financial Intelligence Operations Platform</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            className="ml-auto shrink-0 rounded-md p-1.5 text-on-primary-container transition-colors hover:bg-primary-container hover:text-on-primary lg:hidden"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <nav className="mt-1 flex flex-col gap-3" aria-label="Primary">
          {NAV_SECTIONS.map((section) => {
            const items = section.items
              .map((item) => {
                if (!item.children) return item;
                const children = item.children.filter((child) => !child.roles || child.roles.includes(role));
                return children.length > 0 ? { ...item, children } : { ...item, children: undefined };
              })
              .filter((item): item is NavItem => item !== null && (!item.roles || item.roles.includes(role)));
            if (items.length === 0) return null;
            return (
              <div key={section.label} className="flex flex-col gap-1">
                <span className="px-3.5 text-[10px] font-bold tracking-widest text-on-primary-container/70 uppercase">{section.label}</span>
                {items.map((item) =>
                  item.children ? (
                    <div key={item.href} className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => setOpenGroup((g) => (g === item.href ? null : item.href))}
                        aria-expanded={openGroup === item.href || pathname.startsWith(item.href)}
                        className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-medium text-on-primary-container transition-colors hover:bg-primary-container hover:text-on-primary"
                      >
                        <item.icon size={18} strokeWidth={2} className="shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {openGroup === item.href || pathname.startsWith(item.href) ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                      {(openGroup === item.href || pathname.startsWith(item.href)) && (
                        <div className="ml-4 flex flex-col gap-0.5 border-l border-on-primary/15 pl-3">
                          <NavLink item={item} pathname={pathname} indent />
                          {item.children.map((child) => (
                            <NavLink key={child.href} item={child} pathname={pathname} indent />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <NavLink key={item.href} item={item} pathname={pathname} />
                  ),
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-on-primary/10 bg-primary-container/40 p-3">
        <Landmark size={16} strokeWidth={2} className="shrink-0 text-on-primary-container" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-semibold tracking-wide text-on-primary-container/70 uppercase">Current institution</span>
          <span className="truncate text-xs font-semibold text-on-primary">{institutionName}</span>
        </div>
        <ChevronRight size={14} className="ml-auto shrink-0 text-on-primary-container/60" />
      </div>
      </aside>
    </>
  );
}
