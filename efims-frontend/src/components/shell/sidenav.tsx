import Link from "next/link";
import { ROLES, type Role } from "@/features/auth/types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Roles allowed to see this item — omit to show to everyone authenticated. */
  roles?: Role[];
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

interface NavSection {
  label: string;
  items: NavItem[];
}

/** Grouped Monitor/Manage/Govern, per the role brief's own navigation grouping intent — adapted,
 * not copied verbatim (the brief's full page inventory for each group doesn't map 1:1 onto what
 * actually exists here; see each section's own items). Mirrors `mockups/screens/
 * command-center.html`'s sidenav item set, but only lists items with a real page behind them, and
 * folds the mockup's separate "Investigations"/"Evidence Vault"/"Containment & Recovery"/
 * "Regulatory & CAPA" items into tabs on the Case detail page instead of top-level nav — those
 * modules are all nested under a specific case in the real backend (`/cases/:caseId/...`), so a
 * case-scoped tab is the more accurate IA than a global list page for something that's never
 * actually browsed independently of a case. `notifications` has a page but no nav entry yet —
 * reached via the topnav bell instead. Add an entry here in the same change that ships that
 * section's first page; a nav link with nothing behind it is worse than no link. */
const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Dashboard", icon: "space_dashboard" },
      { href: "/signals", label: "Signals", icon: "flag", roles: EXCEPT_REPORTER },
      { href: "/incidents", label: "Incidents", icon: "crisis_alert", roles: EXCEPT_REPORTER },
    ],
  },
  {
    label: "Manage",
    items: [{ href: "/cases", label: "Cases", icon: "folder_managed", roles: EXCEPT_REPORTER }],
  },
  {
    label: "Govern",
    items: [
      { href: "/audit", label: "Audit Trail", icon: "history_edu", roles: AUDIT_READ_ROLES },
      { href: "/configuration", label: "Configuration", icon: "settings", roles: CONFIG_ROLES },
      { href: "/users", label: "Users", icon: "manage_accounts", roles: USER_MANAGEMENT_ROLES },
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
            const items = section.items.filter((item) => !item.roles || item.roles.includes(role));
            if (items.length === 0) return null;
            return (
              <div key={section.label} className="flex flex-col gap-1">
                <span className="px-3.5 text-[10px] font-bold tracking-widest text-on-primary-container uppercase">{section.label}</span>
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium text-on-primary/80 transition-colors hover:bg-primary/40 hover:text-on-primary"
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
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
