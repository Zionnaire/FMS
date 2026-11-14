import Link from "next/link";
import { ROLES, type Role } from "@/features/auth/types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Roles allowed to see this item — omit to show to everyone authenticated. */
  roles?: Role[];
  /** One level of sub-items (Settings' sub-nav) — rendered indented under the parent, parent
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

/** Grouped Monitor/Manage/Govern, matching the user's own confirmed sidebar list. Investigations,
 * Evidence, Approvals, Containment, Recoveries, and Remediation were previously case-detail tabs
 * only ("a case-scoped tab is the more accurate IA than a global list page for something that's
 * never actually browsed independently of a case") — the user's concrete sidebar list asked for
 * these as real top-level pages too, so they now exist both ways: a cross-case register here, and
 * the same data still reachable per-case via the existing case-detail tabs. `notifications` still
 * has a page but no nav entry — reached via the topnav bell instead. Add an entry here in the same
 * change that ships any future section's first page; a nav link with nothing behind it is worse
 * than no link. */
const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: "space_dashboard" },
      { href: "/intake", label: "Intake & triage", icon: "flag", roles: EXCEPT_REPORTER },
      { href: "/cases", label: "Cases", icon: "folder_managed", roles: EXCEPT_REPORTER },
      { href: "/investigations", label: "Investigations", icon: "fact_check", roles: EXCEPT_REPORTER },
      { href: "/evidence", label: "Evidence", icon: "inventory_2", roles: EXCEPT_REPORTER },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/approvals", label: "Approvals", icon: "policy", roles: EXCEPT_REPORTER },
      { href: "/containment", label: "Containment", icon: "shield_lock", roles: EXCEPT_REPORTER },
      { href: "/recovery", label: "Recoveries", icon: "account_balance", roles: EXCEPT_REPORTER },
      { href: "/remediation", label: "Remediation", icon: "build_circle", roles: EXCEPT_REPORTER },
      { href: "/tools/transaction-risk-scoring", label: "Transaction risk scoring", icon: "radar", roles: EXCEPT_REPORTER },
    ],
  },
  {
    label: "Govern",
    items: [
      { href: "/regulatory", label: "Regulatory reports", icon: "gavel", roles: AUDIT_READ_ROLES },
      { href: "/audit", label: "Audit trail", icon: "history_edu", roles: AUDIT_READ_ROLES },
      { href: "/referrals", label: "HR & legal referrals", icon: "folder_shared", roles: HR_LEGAL_REFERRAL_ROLES },
      { href: "/whistleblowing", label: "Protected disclosures", icon: "shield_person", roles: PROTECTED_DISCLOSURE_ROLES },
      {
        href: "/configuration",
        label: "Settings",
        icon: "settings",
        children: [
          { href: "/configuration", label: "Configuration", icon: "settings", roles: CONFIG_ROLES },
          { href: "/users", label: "People & access", icon: "manage_accounts", roles: USER_MANAGEMENT_ROLES },
          { href: "/settings/integrations", label: "Integrations", icon: "cable", roles: CONFIG_ROLES },
          { href: "/settings/retention", label: "Retention & legal holds", icon: "lock_clock", roles: RETENTION_ROLES },
        ],
      },
    ],
  },
];

export function SideNav({ role }: { role: Role }) {
  return (
    <aside className="fixed top-0 left-0 z-40 flex h-screen w-64 flex-col justify-between overflow-y-auto bg-primary-container p-4 text-on-primary shadow-hero">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container">
            <span className="font-headline text-base font-bold">E</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-on-primary">EFIMS Core</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-primary-container">
              Bank 1
            </span>
          </div>
        </div>

        <nav className="mt-1 flex flex-col gap-3">
          {NAV_SECTIONS.map((section) => {
            const items = section.items
              .map((item) => {
                if (!item.children) return item;
                const children = item.children.filter((child) => !child.roles || child.roles.includes(role));
                return children.length > 0 ? { ...item, children } : null;
              })
              .filter((item): item is NavItem => item !== null && (!item.roles || item.roles.includes(role)));
            if (items.length === 0) return null;
            return (
              <div key={section.label} className="flex flex-col gap-1">
                <span className="px-3.5 text-[10px] font-bold tracking-widest text-on-primary-container uppercase">{section.label}</span>
                {items.map((item) => (
                  <div key={item.href} className="flex flex-col gap-0.5">
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium text-on-primary/80 transition-colors hover:bg-primary/40 hover:text-on-primary"
                    >
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                    {item.children && (
                      <div className="ml-4 flex flex-col gap-0.5 border-l border-on-primary/10 pl-3">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-medium text-on-primary/70 transition-colors hover:bg-primary/40 hover:text-on-primary"
                          >
                            <span className="material-symbols-outlined text-[16px]">{child.icon}</span>
                            <span>{child.label}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="rounded-xl border border-on-primary/10 bg-primary/30 p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-tertiary-fixed" />
          <span className="font-mono text-[11px] font-medium text-on-primary/90">Backend connected</span>
        </div>
        <span className="font-mono text-[10px] text-on-primary/50">EFIMS backend, live</span>
      </div>
    </aside>
  );
}
