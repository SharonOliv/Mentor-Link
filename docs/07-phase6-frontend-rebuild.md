# Phase 6 — Frontend Rebuild

A full TypeScript + Vite rewrite of the React frontend: one login page, real route protection, an axios client with automatic token refresh, a Socket.IO context, and three role-specific dashboards built on shared plumbing.

---

## What was actually broken in the original frontend

Worth being specific about this, since it explains most of the design choices below.

**1. There was no route protection at all.** `App.jsx` defined `/admin/dashboard`, `/teacher/dashboard`, and `/student/dashboard` as plain routes with no guard of any kind. Anyone could type `yoursite.com/admin/dashboard` into a browser and the admin UI would render — whether the API calls inside it succeeded depended entirely on whether *that specific component* happened to check for a token, which was inconsistent. This is the actual frontend half of the backend's auth story, and it was simply missing. `ProtectedRoute` and `RoleRoute` (in `src/routes/`) are the fix — nothing renders without a confirmed, role-matching session.

**2. Tokens lived in `localStorage` under inconsistent, role-specific keys.** `StudentForm.jsx` did `localStorage.setItem("Student jwtToken", token)`; presumably the teacher and admin forms used their own differently-named keys. Besides the inconsistency, anything in `localStorage` is readable by any JavaScript running on the page — a single XSS vulnerability anywhere in the app (a dependency, a rendered user-supplied string, anything) can read every token out of storage. The new `api/client.ts` keeps the access token in a module-level JavaScript variable, never written to disk in any browser storage API, and the longer-lived refresh token never touches the frontend's JavaScript at all — it lives in an httpOnly cookie the browser manages and the backend reads.

**3. Three separate login forms, one shared backend behavior.** `StudentForm.jsx`, `TeacherForm.jsx`, and `AdminForm.jsx` were nearly-identical components, each hardcoding which API endpoint to call and which role to expect back, then manually checking `response.data.data.user.roles !== "student"` and erroring if it didn't match. This is exactly backwards from how the backend's new single login endpoint works — the role comes back as data, not as something the frontend has to assert against an endpoint it already chose. `LoginPage.tsx` is one form; the post-login redirect reads `user.role` from the response and goes to the matching dashboard.

**4. No real-time anything, no notification system.** Reasonable for the original scope — the backend didn't have it either. `SocketContext.tsx`, the notification feature folder, and the `useXRealtimeUpdates` hooks in each role's feature folder are new.

---

## Project structure

```
frontend/src/
├── api/
│   ├── client.ts          # axios instance, in-memory token, auto-refresh-on-401
│   └── auth.ts
├── context/
│   ├── AuthContext.tsx     # login/logout state, silent refresh on page load
│   └── SocketContext.tsx   # Socket.IO connection, reconnects when token changes
├── routes/
│   ├── ProtectedRoute.tsx  # must be logged in
│   └── RoleRoute.tsx       # must be a specific role
├── layouts/
│   └── DashboardLayout.tsx # shared sidebar shell for all three roles
├── components/
│   ├── Button.tsx
│   ├── FullPageSpinner.tsx
│   └── StatusStamp.tsx     # the "ledger stamp" status badge — see design notes below
├── features/
│   ├── auth/               # LoginPage, ChangePasswordPage
│   ├── mentor/              # API, hooks, MentorDashboard
│   ├── student/             # API, hooks, StudentDashboard
│   ├── admin/                # API, hooks, AdminDashboard, CreateUserForm, BulkImportForm
│   └── notifications/        # API, hooks, NotificationsPage
├── pages/
│   └── NotFoundPage.tsx
├── types/index.ts            # shared types matching the backend's models
├── utils/formatDate.ts
├── App.tsx                    # full route tree
└── main.tsx                    # provider wiring
```

---

## The token-refresh interceptor — the trickiest piece of plumbing here

`api/client.ts` does something worth understanding rather than just copying: it transparently retries a request that failed with 401 by first calling `/auth/refresh`, and queues concurrent failures so multiple simultaneous 401s don't each trigger their own refresh call.

```typescript
let refreshPromise: Promise<string | null> | null = null;

// inside the response interceptor, on a 401:
if (!refreshPromise) {
  refreshPromise = performRefresh().finally(() => { refreshPromise = null; });
}
const newToken = await refreshPromise;
```

Why this matters concretely: a dashboard page often fires several API calls on load (e.g. the mentor dashboard requests both `/mentor/slots` and `/mentor/bookings/pending` at once). If the access token happened to expire right at that moment, both requests fail with 401 within the same tick. Without the `refreshPromise` guard, that's two separate calls to `/auth/refresh` racing each other — wasteful, and if the backend ever adds refresh token rotation (mentioned as a future hardening step in the backend docs), a second refresh call using a token the first call already rotated away would fail. The guard means only one refresh call ever happens at a time, and every other failed request waits on that same promise and retries with whatever token comes back.

---

## Why the access token isn't in localStorage, restated plainly

This is worth restating because it's a common "but it's easier" temptation: storing the access token in `localStorage` would mean it survives a page refresh without needing the silent-refresh dance in `AuthContext`. The tradeoff isn't worth it — `localStorage` is readable by any script that runs on the page, by design, with no exceptions. An httpOnly cookie (used for the refresh token) cannot be read by JavaScript at all, which is a meaningfully stronger guarantee against the most common real-world way tokens leak (XSS via a compromised dependency, not some exotic attack). Keeping the access token in memory and re-deriving it from the httpOnly-cookie-backed refresh token on page load is slightly more code, in exchange for a real security property.

---

## Real-time wiring per dashboard

Each dashboard's `hooks.ts` includes a `use<Role>RealtimeUpdates()` hook that subscribes to the relevant Socket.IO events and invalidates the matching React Query cache key — so the UI updates the moment the backend's domain event fires, without polling. For example, the mentor dashboard:

```typescript
socket.on("booking:requested", () => {
  queryClient.invalidateQueries({ queryKey: PENDING_KEY });
  toast("New appointment request received", { icon: "📩" });
});
```

This is deliberately just a cache invalidation, not a manual cache update with the socket payload — React Query refetches from the REST endpoint, which is slightly more network traffic but means the displayed data can never drift from what the server actually has (a manually-patched cache risks getting out of sync if, say, two events arrive close together and overwrite each other's optimistic update).

---

## Design notes

Built per the studio brief in the design skill rather than reaching for default AI-generated aesthetics. The brief here: a university scheduling tool, not a marketing site — so the direction leans into *academic-ledger* materials rather than generic SaaS blue.

- **Palette**: deep ink navy (`#1B2A4A`) as the primary surface color, warm paper (`#FAF7F0`) as the background instead of stark white, a brass accent (`#B08D57`) for primary actions (evokes university plaques/seals without being literal), sage for approved states, terracotta for pending/attention states — calmer than a generic red/green traffic-light scheme.
- **Type**: Source Serif 4 for headings (bookish, institutional) paired with Inter for UI text, IBM Plex Mono for the one place monospace earns its keep — the status stamps.
- **Signature element**: `StatusStamp` — an appointment's status renders like a stamp on a ledger page (slight rotation, double border, uppercase monospace) rather than a generic colored pill. It's the one place this design takes a visual risk; everything else (tables, forms, sidebar) stays quiet and disciplined around it.
- **Accessibility floor**: visible focus rings via `:focus-visible` (the original app had none), `prefers-reduced-motion` respected globally, every icon-only button has an `aria-label`.

---

## What was actually tested vs. reviewed-but-unverified

This phase had more room to actually verify behavior than previous ones, since a frontend doesn't need a live database to prove a lot of things — only a live *backend* — and several useful checks don't even need that.

**Verified by actually running (not just reading):**
- `npx tsc -b --noEmit` — zero TypeScript errors across the entire frontend, all packages, all files.
- `npm run build` — a real Vite production build completes successfully and produces working output (`dist/index.html`, bundled JS/CSS).
- Booted the dev server and loaded `/login` in an actual headless Chromium browser (via Playwright) — confirmed the page renders with the correct title, heading, and both form inputs present, and **confirmed zero uncaught JavaScript exceptions** during the full mount-and-render cycle, including the `AuthContext`'s silent-refresh-on-load effect firing and failing gracefully against a backend that wasn't running.
- Filled in the login form and submitted it in that same real browser — confirmed the network request that fired was `POST http://localhost:5000/api/v1/auth/login` (the correct backend URL and path, built correctly from `import.meta.env.VITE_BACKEND_URL`), confirmed the failure (since no backend was listening) was caught and displayed as a toast rather than crashing the app, and confirmed no uncaught exceptions occurred during that failure path either.

**Reviewed carefully, not run end-to-end (the honest gap, consistent with every backend phase so far, now also true on the frontend side):** I could not test an actual successful login, an actual dashboard rendering with real data, or an actual Socket.IO connection completing — all three need a live backend with a live MongoDB connection, which this sandbox cannot provide for the same networking reasons noted in every backend phase. The component code itself (data fetching with React Query, the dashboard layouts, the mutation hooks) follows the same straightforward patterns I've already verified compile and bundle correctly, but you should be the one to run the full stack together — backend (`npm run dev` in `backend/`) and frontend (`npm run dev` in `frontend/`) — and actually log in with one of the seeded test accounts before considering this phase done. That's the most important remaining verification step in the whole project so far: it's the first point where backend and frontend, built independently across six phases, actually have to work together.

A good first manual test once both are running: log in as `priya.sharma@university.edu` (seeded mentor), create a slot, then in a second browser (or incognito window) log in as `aisha.khan@university.edu` (seeded student), book that slot, and confirm the mentor's tab shows the new pending request without a page refresh.

---

**Next:** Google Calendar integration (Phase 7 in the original numbering) and the admin analytics dashboard remain as backend-plus-frontend additions. Deployment (Vercel for this frontend, Render/Railway for the backend, MongoDB Atlas for the database) is the last item on the original roadmap. Say which you'd like next, or "go" for Calendar integration.
