# EFIMS 

**Enterprise Financial Crime Intelligence & Incident Management System: a multi-tenant SaaS for banks to manage fraud and financial-crime incidents from first signal to regulatory report.**

EFIMS gives a bank's fraud, risk, and compliance teams one system for the whole lifecycle: intake, triage, investigation, evidence, containment, recovery, corrective action (CAPA), regulatory reporting, and audit. It's built for the realities of regulated banking. Tenant isolation is enforced at the database engine. The audit trail is tamper-evident. Sensitive cases (AML, whistleblowing, legal privilege, HR, executive) are walled off by compartment. **No adverse action ever fires without a human approval.**

<!-- 🔗 Live demo: add link · ![Dashboard](mockups/screens/...) -->

---

## ✨ What it does

- **Signal → Incident → Case:** three distinct stages. Raw signals are validated or rejected, promoted to incidents, triaged by severity, then opened as cases.
- **Triage & SLAs:** severity and routing assessment, escalation, and SLA clocks that can start, pause, resume, and stop, with working-calendar support.
- **Case management:** a tabbed case workspace covering Overview, Approvals, Investigations, Evidence, Containment, Recovery, CAPA, and Regulatory.
- **Investigations:** plans, issues, interviews, and findings.
- **Evidence vault:** hashed evidence with chain-of-custody events and legal hold.
- **Containment, confirmation-gated:** EFIMS *requests* account freezes or card blocks and only marks a case contained once the source system confirms. It never acts on its own.
- **Recovery & CAPA:** a loss and recovery ledger with reconciliation, plus root cause, corrective actions, and validation.
- **Regulatory reporting:** an obligations register and approval-gated submissions.
- **Approval matrix:** containment, loss write-off, and regulatory submission all pass through one reusable approval check. Approvals can't be reused across actions, enforced by a database constraint.
- **Whistleblower protection:** reporter identity is stored in a separate vault from case content.
- **Notifications:** templates, escalation, and live in-app push over Socket.IO.
- **Platform console:** a super-admin area for managing tenants.

## 🔐 Security model

- **Tenant isolation, twice:** app-layer tenant-context middleware plus **PostgreSQL Row-Level Security** as the backstop. A session with no tenant set sees zero rows.
- **7-condition case access:** tenant match, role permission, team match (or elevated role), not a subject or conflict on the case, clearance ≥ case sensitivity, and an authorised compartment. **Every denial is itself audited.**
- **Append-only audit:** a per-tenant hash chain with an oversight-only verify API. There is no update or delete path.
- **BFF frontend:** the browser never calls the backend directly. All API calls happen server-side in Next.js Server Components and Server Actions.
- **Hardening:** Argon2 password hashing, JWT with silent refresh, rate limiting, security headers, CORS, and health checks.

## 🏗 Architecture

A **modular monolith** in NestJS. Modules communicate only through their public service interfaces or an in-process event bus, never by reading each other's tables.

```
identity → configuration → incidents → triage → cases → workflow → audit
          + notifications · investigations · evidence · containment · recovery · capa · regulatory
```

Advisory AI (via Groq, routed through a single `ml-gateway` module) is part of the design. Redis, Kafka, Temporal, OpenSearch, and Neo4j are deliberately deferred until a phase needs them; trigger conditions are documented in `docs/architecture.md`.

## 🛠 Tech Stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Zod, Socket.IO client |
| Backend | NestJS, TypeScript, Prisma, PostgreSQL (RLS), Socket.IO, Argon2, JWT, Throttler, Terminus |
| Deploy | Render (backend), any Postgres (Render, Neon, or local) |

## 📁 Repository

```
efims-backend/    NestJS API — see its README for full setup (migrations, RLS role, seed)
efims-frontend/   Next.js app — auth/session architecture, module coverage
docs/             architecture.md · design-system.md · configuration-decisions.md · CHANGELOG.md
mockups/          design tokens and screen mockups ("Botanical Executive" design system)
```

## 🚀 Quick Start

```bash
# Backend
cd efims-backend
cp .env.example .env                       # DATABASE_URL (privileged role) + DIRECT_URL
npm install
npm run prisma:migrate:dev -- --name init
npm run db:rls                             # creates efims_app role + RLS policies — rotate its password!
npm run seed                               # demo tenant bank-1 + sample signals, incidents, cases
npm run start:dev

# Frontend
cd efims-frontend
npm install
npm run dev
```

> ⚠️ After seeding, switch `DATABASE_URL` to the `efims_app` role. Table owners and superusers bypass RLS. Full steps are in [`efims-backend/README.md`](efims-backend/README.md).

## 👤 Author

**Fowosere Ademola Abraham** ([@Zionnaire](https://github.com/Zionnaire)): Full-Stack Engineer, AI Integration
