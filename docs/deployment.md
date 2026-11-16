# Deploying to Render

`render.yaml` (repo root) defines both services as a Render Blueprint — native Node runtime, no
Docker (simpler and more reliable for a plain NestJS + Next.js monorepo; see
`docs/CHANGELOG.md`'s dated entry for why Docker was considered and not used).

## 1. First deploy

1. In the Render dashboard: **New → Blueprint**, connect this repo, select `render.yaml`.
2. Render will ask for every env var marked `sync: false` in `render.yaml` before the first
   deploy. Have these ready:
   - **`DATABASE_URL` / `DIRECT_URL`** (backend) — a real Postgres connection string. This
     project was built and verified against Neon's free tier; see
     `efims-backend/.env.example`'s own detailed comments on the pooled-vs-direct distinction.
   - **`GROQ_API_KEY`** (backend, optional) — from <https://console.groq.com/keys>. Leave blank
     if you don't have one yet; `ml-gateway` degrades to a clean 503, not a crash, when it's
     unconfigured.
   - **`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`** (backend) and **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`**
     (frontend) — generate ONE pair locally first:
     ```bash
     cd efims-backend && npx web-push generate-vapid-keys
     ```
     Paste the private key into the backend's `VAPID_PRIVATE_KEY`, and the **same** public key
     into both the backend's `VAPID_PUBLIC_KEY` and the frontend's `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
     — they must be byte-for-byte identical, or a subscribed browser's pushes fail to decrypt.
   - **`CORS_ORIGINS`** (backend) and **`BACKEND_URL`** / **`NEXT_PUBLIC_REALTIME_URL`**
     (frontend) — leave these as a placeholder for now (e.g. `http://localhost:3000` /
     `http://localhost:3001`); step 2 below replaces them with the real values.
3. Deploy. Both services will build and start, but **the frontend and backend can't actually
   reach each other yet** — that's step 2, not a failure.

## 2. Wire the two services together (required, one-time)

Render's Blueprint spec has no confirmed syntax for copying one service's public URL into
another service's env var automatically (its `fromService` field only exposes a service's
*private*-network host/port, not its public HTTPS URL) — this has to be done once, manually,
after both services have their real `onrender.com` URLs:

1. Open the **efims-backend** service in the Render dashboard, copy its URL (e.g.
   `https://efims-backend-xxxx.onrender.com`).
2. Open the **efims-frontend** service's Environment tab, set:
   - `BACKEND_URL` → that URL
   - `NEXT_PUBLIC_REALTIME_URL` → that same URL
3. Open the **efims-frontend** service, copy its URL (e.g.
   `https://efims-frontend-xxxx.onrender.com`).
4. Open the **efims-backend** service's Environment tab, set:
   - `CORS_ORIGINS` → that URL
5. Both services redeploy automatically when you save an env var change. Once both finish, the
   app is fully wired.

## 3. Database migrations

Handled automatically — the backend's `startCommand` runs `npx prisma migrate deploy` before
starting the server, on every deploy. It's idempotent (only applies pending migrations), so
redeploying without new migrations is a no-op there.

RLS policies (`efims-backend/prisma/rls-policies.sql`) are **not** run automatically — they only
need to run once, the first time a fresh database is created. If deploying against a brand-new
(not already-seeded) database, run this once from a machine that can reach it:

```bash
cd efims-backend
DATABASE_URL="<your DIRECT_URL>" npx prisma db execute --file prisma/rls-policies.sql --schema prisma/schema.prisma
```

## 4. Before a live demo

Both services are on Render's **free** plan by default (see `render.yaml`) — free services spin
down after a period of inactivity, and the first request after that takes 30-60+ seconds to cold
-start. Before demoing live, either:

- Visit both services' URLs a few minutes beforehand to warm them up, or
- Upgrade to a paid plan (change `plan: free` to a paid plan ID in `render.yaml`, e.g.
  `starter`) for the duration of the demo.
