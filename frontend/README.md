# Frontend (v2) — Faculty Appointment Management System

TypeScript + React + Vite frontend. This document covers the complete rebuild through **Phase 9 (deployment)** — the rebuild is done. See the project root README for the full phase-by-phase history.

## Stack

- React 18 + Vite + TypeScript (strict mode)
- Tailwind CSS
- TanStack Query (React Query) for data fetching/caching
- React Router v6
- Socket.IO client
- Axios

## Setup

```bash
npm install
cp .env.example .env
```

Set `VITE_BACKEND_URL` in `.env` to wherever the backend is running (e.g. `http://localhost:5000`).

```bash
npm run dev      # starts on http://localhost:5173
npm run build    # type-checks (tsc -b) then builds for production
npm run preview  # preview the production build locally
```

Log in with one of the accounts created by the backend's `npm run seed` script — see the backend README for the credential list.

## Project structure

```
src/
├── api/          axios instance with token-refresh interceptor, auth API calls
├── context/      AuthContext (login state), SocketContext (real-time connection)
├── routes/       ProtectedRoute, RoleRoute — the actual route-guard fix (see below)
├── layouts/      shared dashboard shell (sidebar + nav)
├── components/   Button, FullPageSpinner, StatusStamp (shared UI primitives)
├── features/     one folder per domain: auth, mentor, student, admin, notifications
│                 — each has its own api.ts, hooks.ts, and page component(s)
├── pages/        standalone pages (404)
├── types/        shared types matching the backend's models
└── App.tsx       full route tree
```

## What changed from the original frontend, and why

- **Every dashboard route is now actually protected.** The original had no route guards at all — `/admin/dashboard` was reachable by typing the URL regardless of login state. `ProtectedRoute` (must be logged in) and `RoleRoute` (must be the matching role) now wrap every dashboard route in `App.tsx`.
- **One login page, not three.** The account's `role` comes back from the single backend login endpoint and decides the redirect — there's no per-role login form making its own assumption about which endpoint to call.
- **The access token lives in memory, not `localStorage`.** The original stored it in `localStorage` under role-specific keys (`"Student jwtToken"`, etc.) — readable by any script on the page. The new client (`api/client.ts`) keeps it in a module-level variable and re-derives it from the backend's httpOnly refresh cookie on page load.
- **Automatic token refresh.** A request that 401s is transparently retried once, after silently calling `/auth/refresh` — the user is never bounced to the login page just because their 15-minute access token expired mid-session. Concurrent 401s share a single in-flight refresh call rather than each triggering their own.
- **Live updates via Socket.IO.** Each dashboard subscribes to the relevant real-time events from the backend (see `backend/docs/06-phase5-realtime-notifications.md`) and invalidates the matching React Query cache — a mentor sees a new booking request the moment it happens, no refresh needed.
- **Mentors can connect Google Calendar.** A card on the mentor dashboard (`CalendarConnectCard`) shows connect/disconnect state and kicks off the OAuth flow with a full-page redirect — not an API call the app waits on. Approved appointments that get a calendar event show a "Join with Google Meet" link on both the mentor's schedule and the student's bookings list.
- **Admin has a real analytics dashboard.** `/admin/analytics` shows bookings by department (bar chart, via `recharts`), busiest mentors with their approve/reject split, an approval-rate stat, and median response time. Note: adding `recharts` increased the production bundle from roughly 350KB to roughly 720KB pre-gzip — a real tradeoff, not an oversight; code-splitting this route is the straightforward fix if bundle size becomes a concern.

## Design notes

A deliberate visual direction rather than default Tailwind blue-on-white: an "academic ledger" palette (ink navy, warm paper background, brass accent, sage/terracotta for status) with a serif display face for headings and a signature `StatusStamp` component that renders booking statuses like a stamped ledger entry rather than a generic colored pill. See `docs/07-phase6-frontend-rebuild.md` for the full design rationale.

## What's tested vs. reviewed-but-unverified

`npx tsc -b --noEmit` and `npm run build` both run clean against this exact codebase, re-verified after each phase's additions including recharts. The login page and direct navigation to several protected dashboard routes (mentor, and now admin analytics) were loaded in an actual headless browser while logged out — all correctly redirect to `/login` with zero uncaught exceptions. **What hasn't been verified**: an actual successful login, real dashboard data, a real Socket.IO connection, a real Google Calendar connect flow, or real analytics numbers — all need a live backend with a live database (and, for calendar, real Google credentials), none of which the development sandbox could provide. Run the backend and this frontend together and log in with a seeded test account before considering any of this complete.

## Deployment

This frontend deploys to Vercel using the included `vercel.json` (a SPA rewrite to `/index.html`, the currently-correct destination per Vercel's docs — the original project's config used `"/"`, which can 404 on a hard refresh of a deep route). Set `VITE_BACKEND_URL` to the deployed backend's URL as a Vercel environment variable. Full walkthrough: `docs/10-phase9-deployment.md`.
