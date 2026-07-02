# Phase 9 — Deployment

Frontend on Vercel, backend on Render, database on MongoDB Atlas. This is the last phase on the original roadmap.

---

## Why the backend can't go on Vercel (the constraint flagged all the way back in Phase 1, now actually mattering)

The original project deployed its backend to Vercel as serverless functions — its `vercel.json` built `index.js` with `@vercel/node` and routed everything through it. That worked for the original app because it was a stateless request/response API with no persistent connections.

This rebuild's backend is not stateless in that sense anymore: since Phase 5, `server.ts` creates an explicit `http.Server` and attaches Socket.IO to it —

```typescript
const httpServer = createServer(app);
initSocketServer(httpServer);
httpServer.listen(env.port, ...);
```

A serverless function is invoked per-request and torn down afterward; it has no concept of a socket connection that stays open between invocations waiting for the next event. Deploying this backend to Vercel's serverless functions would mean every Socket.IO connection gets silently killed the moment the underlying function instance is recycled — the real-time layer from Phase 5 (live booking updates, the notification bell) would intermittently stop working in a way that's confusing to debug, not cleanly broken. The fix isn't a code change; it's choosing a host that runs your `node dist/server.js` as one continuously-running process. Render and Railway both do this; Vercel's serverless model fundamentally doesn't.

The frontend has no such constraint — it's a static bundle of HTML/JS/CSS, exactly what Vercel is built for, and stays there.

---

## What this guide checked, specifically, rather than assumed

Every platform-specific detail below was checked against current (2026) documentation rather than relying on possibly-outdated general knowledge, since hosting platforms' free tiers and config syntax change often enough that a stale assumption here would cost you real debugging time:

- **Vercel's SPA rewrite destination.** The original frontend's `vercel.json` rewrote to `destination: "/"`. Vercel's current documentation and multiple independent reports confirm the correct destination for a Vite SPA is `/index.html` — `"/"` can produce 404s on a hard refresh of a deep route (e.g. `/mentor/dashboard`) in some configurations. Fixed in this rebuild's `vercel.json`.
- **Render's Blueprint (`render.yaml`) syntax**, including `runtime: node` (the current field name — `env` is its deprecated alias, still accepted but discouraged), `generateValue: true` for auto-generated secrets, and `sync: false` for values you provide manually in the dashboard rather than committing to the file.
- **Render's free-tier behavior for WebSocket workloads specifically**, since this is the detail most relevant to a Socket.IO app: as of a February 2026 platform change, a free web service now stays awake while actively receiving WebSocket messages on an existing connection, not just HTTP requests — previously, a service could spin down due to inactivity even mid-conversation over a live socket. It still spins down after a true 15 minutes of no traffic at all, and takes roughly 30 seconds to a minute to wake back up on the next request. For a class project or demo this is a real but bearable trade-off; for anything with paying users or strict uptime needs, the paid tier removes spin-down entirely.
- **Railway's current pricing**, since the original roadmap doc listed Render/Railway as roughly equivalent free options — that's no longer accurate. Railway removed its permanent free tier in 2023; it now offers a one-time $5 trial credit, after which a card is required and the ongoing minimum cost is real (a $5/month Hobby plan, or a "Free" plan at $1/month with reduced limits). Render remains the more genuinely free option for this project's scope, which is why it's the primary recommendation below — Railway is documented as a fallback in case Render's free-tier limits don't fit your situation, not as an equally-free alternative.
- **MongoDB Atlas's M0 free tier**, confirmed still permanently free with no time limit (512MB storage, 500 connections) — comfortably enough for this app's seeded test data and realistic small-scale use.

---

## Step 1 — MongoDB Atlas

1. Create a free account at [mongodb.com/atlas](https://www.mongodb.com/atlas), then build a database choosing the **M0 (Free)** tier.
2. Under Database Access, create a database user with a strong generated password — this is what goes into `DB_URL`, not your Atlas account password.
3. Under Network Access, add `0.0.0.0/0` (allow from anywhere) for simplicity, or Render's specific outbound IP ranges if you want to lock it down further (see Render's docs on outbound IPs — these can change, so check current values rather than hardcoding old ones).
4. Click Connect → Drivers → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/faculty-appointments?retryWrites=true&w=majority
   ```
   This full string is your `DB_URL`.

---

## Step 2 — Backend on Render

A `render.yaml` Blueprint is included in `backend/` — this lets Render provision the service with most configuration already filled in, rather than clicking through every field manually.

```yaml
services:
  - type: web
    name: faculty-appointment-backend
    runtime: node
    plan: free
    region: oregon
    buildCommand: npm install && npm run build
    startCommand: npm run start
    healthCheckPath: /
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: FRONTEND_URL
        sync: false
      - key: DB_URL
        sync: false
      - key: JWT_ACCESS_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      # ...and the rest of the Phase 1 env vars, all sync: false
```

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In the Render Dashboard, **New → Blueprint**, connect the repo, and point it at `backend/render.yaml` if it isn't auto-detected at the repo root.
3. Render prompts you for every `sync: false` value during this initial creation — this is where you paste in your real `DB_URL` (from Step 1), `FRONTEND_URL` (your eventual Vercel URL — you can update this after Step 3 if you don't have it yet), mail credentials, and Google OAuth credentials if using Calendar integration.
4. `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are auto-generated by Render (`generateValue: true`) — you never need to invent these yourself.
5. Deploy. Render builds with `npm install && npm run build` (compiling TypeScript to `dist/`) and starts with `npm run start` (`node dist/server.js`).
6. Once live, run the seed script once against this production database — easiest via Render's Shell tab on the service (`npm run seed`), or by temporarily running it locally with `DB_URL` pointed at the Atlas cluster.

**A note on the free tier's spin-down**, concretely: the first request after 15 minutes of total inactivity takes up to about a minute while the service wakes up. Real users will perceive this as a slow initial load, not an error — the request still completes, it just blocks for that wake-up window. If this matters for your use case (a live demo for a professor, for instance, rather than just personal testing), either upgrade to a paid instance type (eliminates spin-down) or hit the health check URL every ten minutes or so with an external uptime-monitoring service to keep it warm — both are reasonable, the second is free but adds a small amount of always-on traffic.

---

## Step 3 — Frontend on Vercel

A `vercel.json` is included in `frontend/`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

1. In the Vercel Dashboard, **New Project**, import the same repo, set the root directory to `frontend/`.
2. Vercel auto-detects the Vite framework preset — build command `vite build` (which this project's `npm run build` already wraps with `tsc -b &&` first), output directory `dist`.
3. Set the environment variable `VITE_BACKEND_URL` to your Render backend's URL (e.g. `https://faculty-appointment-backend.onrender.com`).
4. Deploy. Once live, go back to your Render backend's environment variables and set `FRONTEND_URL` to this Vercel URL — this is what the backend's CORS config and cookie settings check against, so it needs the real production URL, not `localhost`.

---

## Step 4 — Google Calendar OAuth redirect URI (if using Phase 7's integration)

The `GOOGLE_REDIRECT_URI` you registered in the Google Cloud Console for local development (`http://localhost:5000/...`) won't work in production. Add a second authorized redirect URI in the Cloud Console pointing at your real Render backend URL:
```
https://faculty-appointment-backend.onrender.com/api/v1/calendar/callback
```
and update the `GOOGLE_REDIRECT_URI` environment variable on Render to match. Google OAuth clients support multiple registered redirect URIs at once, so you don't need separate OAuth clients for local development and production.

---

## Production checklist

- [ ] `DB_URL` points at the Atlas cluster, not a local MongoDB
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are the Render-generated values, not whatever you used locally
- [ ] `FRONTEND_URL` on the backend matches the real Vercel URL exactly (including `https://`, no trailing slash)
- [ ] `VITE_BACKEND_URL` on the frontend matches the real Render URL exactly
- [ ] `NODE_ENV=production` is set on the backend — this is what `errorHandler.ts` checks to decide whether to include stack traces in error responses (see Phase 1)
- [ ] CORS: confirm `cors({ origin: env.frontendUrl, credentials: true })` in `server.ts` is actually using the production `FRONTEND_URL`, not a hardcoded localhost value left over from development
- [ ] Mail credentials are real production SMTP credentials, not a personal account's password (Gmail in particular requires an App Password, not your normal login password, for SMTP access)
- [ ] Google OAuth redirect URI is registered for the production callback URL (Step 4 above), if using Calendar integration
- [ ] The seed script has been run once against production, OR you've created real accounts through the admin UI instead — don't ship with zero accounts and no way to log in
- [ ] You've actually logged in against the deployed app with a real account and confirmed the full loop: login → book a slot → approve it → see the real-time update — this is the actual end-to-end test that every previous phase's doc flagged as "reviewed but not run end-to-end" due to sandbox limitations. This is where that finally gets resolved, on real infrastructure instead of a development sandbox.

---

## What was checked vs. what you should verify yourself

**Checked against current, dated documentation (not assumed from general/possibly-stale knowledge):** Vercel's recommended SPA rewrite destination, Render's current Blueprint YAML field names and syntax, Render's free-tier WebSocket spin-down behavior (specifically the February 2026 change), Railway's current pricing structure, and MongoDB Atlas's M0 free-tier limits. Each of these is the kind of detail that changes across platform updates faster than general programming knowledge does, so checking rather than assuming was deliberate here, not incidental.

**Not and cannot be verified from this environment:** Whether your specific Render/Vercel/Atlas accounts behave exactly as documented (regional availability, any account-specific limits, future platform changes after this was written), and — the big one — the actual live, full-stack, real-database test described in the production checklist's last item. Every previous phase in this rebuild flagged a "reviewed carefully but not run end-to-end" gap because this development sandbox couldn't reach a live MongoDB, run a persistent server with a connecting client, or reach Google's APIs. Deploying for real, on real infrastructure, is what finally closes every one of those gaps — which is exactly why this is the last step, not an optional add-on after the "real" work is done.

---

This completes the 9-phase rebuild: backend foundation, data layer, auth & RBAC, mentor/student modules, real-time + notifications, frontend, Calendar integration, admin analytics, and now deployment. See the project root README for the full phase-by-phase index and the cumulative list of what changed from the original codebase and why.
