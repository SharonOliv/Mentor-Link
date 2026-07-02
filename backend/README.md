# Backend (v2) — Faculty Appointment Management System

TypeScript + Express + MongoDB backend. This document covers the complete rebuild through **Phase 9 (deployment)** — the rebuild is done. See the project root README for the full phase-by-phase history.

## Stack

- Node.js + Express + TypeScript (strict mode)
- MongoDB + Mongoose
- JWT (access + refresh tokens)
- Zod for request validation
- bcryptjs for password hashing (not `bcrypt` — see note below)
- Socket.IO for real-time updates

> **Deployment note:** this server now attaches Socket.IO to the same HTTP server Express runs on, which needs a long-running process — it will not work correctly on Vercel serverless functions. Plan to deploy this backend to Render, Railway, or a similar host that keeps the process alive between requests. See `docs/01-architecture-and-roadmap.md` for the full reasoning and `docs/06-phase5-realtime-notifications.md` for the specifics.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

DB_URL=mongodb://127.0.0.1:27017/faculty-appointments   # or an Atlas connection string

JWT_ACCESS_SECRET=<a long random string>
JWT_REFRESH_SECRET=<a different long random string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_email@gmail.com
MAIL_PASS=your_app_password

# Optional - leave blank if not using Google Calendar integration
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/calendar/callback
```

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be different values — generate two separately, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` run twice.

## Seed test data

```bash
npm run seed
```

Creates one admin, two mentors, two students, and a handful of appointment slots (some open, some booked). Prints the test credentials to the console when done. Safe to re-run — it clears `users` and `appointments` first.

| Role | Email | Password |
|---|---|---|
| Admin | admin@university.edu | Admin@12345 |
| Mentor | priya.sharma@university.edu | Mentor@12345 |
| Mentor | james.okoro@university.edu | Mentor@12345 |
| Student | aisha.khan@university.edu | Student@12345 |
| Student | liam.chen@university.edu | Student@12345 |

These are seeded with `mustChangePassword: false` so you can log straight in without hitting the forced-password-change flow during testing. Real admin-created accounts default to `mustChangePassword: true`.

## Run

```bash
npm run dev      # ts-node-dev, restarts on file change
npm run build    # compiles to dist/
npm run start    # runs the compiled output — use this in production
```

Server starts on the port from `.env` (default 5000). `GET /` returns a health-check JSON response.

## API reference (Phases 1–3)

### Auth — `/api/v1/auth`

| Method | Path | Auth required | Body | Notes |
|---|---|---|---|---|
| POST | `/login` | No | `{ email, password }` | Rate-limited to 10 attempts / 15 min per IP. Sets an httpOnly refresh-token cookie and returns an access token in the response body. |
| POST | `/refresh` | No (reads cookie) | — | Returns a new access token if the refresh cookie is still valid. |
| POST | `/logout` | No | — | Clears the refresh-token cookie. |
| GET | `/me` | Yes | — | Returns the decoded user info from the current access token. |
| PATCH | `/change-password` | Yes | `{ currentPassword, newPassword }` | Self-service; also clears `mustChangePassword`. |

The frontend should store the access token in memory (not localStorage — it's short-lived by design and a refresh call gets a new one), and rely on the browser to handle the httpOnly refresh cookie automatically.

### Admin — `/api/v1/admin`

Every route below requires a valid access token **and** `role: "admin"`. Both checks are applied once, at the top of the router, so there's no route in this file that can be left unprotected by accident.

| Method | Path | Body / Params | Notes |
|---|---|---|---|
| GET | `/users` | Query: `?role=`, `?department=` | List/filter users. |
| POST | `/users` | `{ email, name, role, department?, subjects? }` | Creates one account. Returns a one-time temporary password in the response — not stored anywhere, not retrievable again. `department` required for `student`/`mentor`, not `admin`. |
| POST | `/users/bulk-import` | multipart, field name `file`, CSV | See CSV format below. Each row succeeds or fails independently. |
| PATCH | `/users/:id/status` | `{ status: "active" \| "disabled" }` | Disabling a user invalidates their session on their *next* request (the `protect` middleware checks status live, not just at login). |
| DELETE | `/users/:id` | — | Cascade-deletes the user's appointments and messages. |

**CSV bulk-import format:**
```csv
email,name,role,department,subjects
aisha.khan@university.edu,Aisha Khan,student,Computer Science,
priya.sharma@university.edu,Dr. Priya Sharma,mentor,Computer Science,"Algorithms,Data Structures"
```
`subjects` is comma-separated within a cell, mentor-only, optional. Max upload size 2MB.

### Mentor — `/api/v1/mentor`

Every route requires a valid access token and `role: "mentor"`.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/slots` | — | All of this mentor's slots |
| POST | `/slots` | `{ scheduledAt, durationMinutes? }` | Must be in the future. Duplicate time for the same mentor returns 409. |
| POST | `/slots/batch` | `{ slots: [...] }` | Up to 100 at once, each independent |
| DELETE | `/slots/:id` | — | Only this mentor's own slots |
| GET | `/bookings/pending` | — | Slots awaiting approval, student details populated |
| PATCH | `/bookings/:id/approve` | — | Emails the student |
| PATCH | `/bookings/:id/reject` | — | Returns the slot to `open`, doesn't delete it |

### Student — `/api/v1/student`

Every route requires a valid access token and `role: "student"`.

| Method | Path | Notes |
|---|---|---|
| GET | `/mentors` | Optional `?department=` filter |
| GET | `/mentors/:mentorId/slots` | Only that mentor's currently-open slots |
| PATCH | `/slots/:id/book` | Atomic claim — see "Notable decisions" below. 409 if already booked. |
| GET | `/bookings` | This student's own bookings, mentor details populated |

### Notifications — `/api/v1/notifications`

Available to any authenticated user, any role — every query is scoped to the logged-in user.

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Most recent 50 notifications |
| GET | `/unread-count` | For a bell-icon badge |
| PATCH | `/:id/read` | Mark one as read |
| PATCH | `/read-all` | Mark everything as read |

### Calendar — `/api/v1/calendar`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/connect` | mentor only | Returns a Google consent-screen URL to redirect the browser to |
| GET | `/callback` | none (Google redirects here directly) | Exchanges the auth code for tokens, redirects back into the frontend |
| GET | `/status` | mentor only | `{ connected: boolean }` |
| DELETE | `/disconnect` | mentor only | Removes stored tokens |

If `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` are unset, `/connect` returns a clean 503 rather than the server failing to start — this is an optional, per-mentor feature, not a required one. See `docs/08-phase7-calendar-integration.md` for the full OAuth flow and Google Cloud Console setup steps.

### Analytics — `/api/v1/analytics`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/summary` | admin only | User counts by role, bookings by department, busiest mentors, approval/rejection rate, median response time |

Backed by a new `BookingEvent` log model (durable history, written alongside but separate from the mutable `Appointment` documents) plus two new fields on `Appointment` (`bookedAt`, `respondedAt`) added specifically so response-time analytics measures the actual booking decision, not an unrelated field update. See `docs/09-phase8-admin-analytics.md` for why this was necessary — short version: rejected bookings used to disappear from history the moment their slot was reused.

### Real-time (Socket.IO)

Connect with the same access token used for REST requests:
```javascript
import { io } from "socket.io-client";
const socket = io(BACKEND_URL, { auth: { token: accessToken } });
```

The connection is rejected (`Authentication required` / `Invalid or expired token`) if no token or an invalid one is provided. Every connected socket automatically joins a room scoped to its own user ID — there's nothing else to subscribe to manually for the events below.

| Event received | When | Payload |
|---|---|---|
| `slot:created` | A mentor's own other tab, after they create a slot | The new slot |
| `booking:requested` | A mentor, when a student books one of their slots | The appointment |
| `booking:approved` | A student, when their booking is approved | The appointment |
| `booking:rejected` | A student, when their booking is rejected | The appointment |
| `slot:deleted` | A mentor's own other tab, after they delete a slot | `{ id }` |
| `notification:new` | Alongside any of the above that creates a persisted notification | The notification document |

Because the access token is short-lived (15 minutes by default), a long-lived socket connection will eventually need to reconnect with a freshly-refreshed token — handle this in the frontend's socket context rather than assuming one connection lasts the whole session.

## Project structure

```
src/
├── config/        env.ts (fail-fast env validation), db.ts (Mongo connection)
├── models/        Mongoose schemas — User, Appointment, Notification, Message
├── controllers/   thin HTTP handlers — no business logic
├── services/      business logic — auth, admin, appointments, notifications, email
├── routes/        Express routers
├── middleware/     auth (protect/restrictTo), validate (Zod), errorHandler
├── validators/      Zod schemas per route group
├── sockets/          Socket.IO server setup, JWT auth, domain-event -> emit mapping
├── utils/          AppError, catchAsync, JWT signing, temp-password gen, email templates
├── types/          shared enums, Express Request augmentation
├── scripts/         seed.ts
└── server.ts        composition root — creates the HTTP server Express and Socket.IO share
```

## Notable decisions / departures from the original codebase

- **`bcryptjs` instead of `bcrypt`** — the original `bcrypt` package requires native compilation on install, which can fail on certain hosts/CI environments without C++ build tools. `bcryptjs` is pure JavaScript, slightly slower, zero install friction. Worth it for a project you're about to deploy to a managed host.
- **No self-registration routes exist.** Not disabled, not hidden behind a flag — there is no `student.routes.ts` or `mentor.routes.ts` registration endpoint in this codebase. Admin is the only path to account creation.
- **One login endpoint for all roles.** `role` comes back from the database lookup, not from which route the client called.
- **Appointment double-booking prevention is one atomic database update**, not a check-then-write pattern. `bookSlot` does a single `findOneAndUpdate({ _id, status: "open" }, { $set: { status: "booked", ... } })` — the read and write happen as one indivisible operation, so two simultaneous booking attempts on the same slot can't both succeed. The original's separate "check if booked" then "push booking" was a real race condition. See `docs/05-phase4-mentor-student-modules.md` for the full explanation.
- **Emails are fire-and-forget**, not awaited inside request handlers. A slow or down mail server no longer blocks a booking approval/rejection from completing.
- **Real-time updates go through an internal event bus, not direct Socket.IO calls from services.** `appointment.service.ts` emits plain domain events (`appointment.booked`, etc.) via Node's built-in `EventEmitter`; a separate listener file (`sockets/appointmentEvents.ts`) decides what to do with each one — emit a socket event, persist a notification, or both. This keeps the business-logic services free of a hard dependency on however real-time delivery happens to be implemented.
- **Calendar sync never blocks or fails a booking approval.** `createCalendarEvent` is wrapped in its own try/catch inside `approveBooking` — if Google's API errors or the mentor hasn't connected a calendar, the approval (already saved) is unaffected.
- **A separate, append-only `BookingEvent` log backs analytics, distinct from the mutable `Appointment` documents.** Rejecting a booking resets its slot back to `"open"` so it can be rebooked — correct for the booking flow, but it means the Appointment document itself loses all evidence a rejection happened. `BookingEvent` records are written at each state transition specifically so historical analytics survives that reset.

## What's tested vs. reviewed-but-unverified

Type-checking (`npx tsc --noEmit`) is verified clean with zero errors for every file through Phase 8. Pure-logic pieces with no database or live-server dependency — Zod validators, the temp-password generator, the internal event bus, the JWT sign/verify cycle, Google OAuth URL construction, and the median/average and approval-rate calculations used by the analytics dashboard (tested against odd/even-length arrays, single values, unsorted input, and the zero-division edge case) — were compiled and actually executed against test inputs. Anything requiring a live MongoDB connection, a running server process with a connecting client, real Google API credentials, or a populated database to run aggregation pipelines against (the seed script, login against real data, the atomic booking claim under concurrent load, an actual Socket.IO connection, the live OAuth token exchange, and the analytics `$lookup`/`$group` pipelines themselves) is carefully reviewed but **was not run end-to-end**. See each phase's doc under `docs/` for the specific manual test suggested for that phase's unverified piece — the analytics pipelines in particular are worth checking against real data before trusting the dashboard, since aggregation pipelines are exactly the kind of code most likely to have a subtle bug that only shows up against real records.

## Deployment

This backend is deployed to Render (not Vercel — see why in `docs/10-phase9-deployment.md`), using the included `render.yaml` Blueprint. MongoDB Atlas's free M0 tier is sufficient for this project's scope. Full walkthrough, including the production environment-variable checklist, is in `docs/10-phase9-deployment.md`.
