# Mentor Link - Faculty Appointment Management System

A full-stack web application for managing appointments between students and faculty mentors at a university or educational institution. Originally a MERN-stack student project; currently being rebuilt into a production-oriented system with TypeScript, role-based access control, and real-time features.
Link : https://mentor-link-woad.vercel.app

> **Status: rebuild complete.** All 9 phases of the rebuild have shipped — see the progress table below for what each phase covered. The new backend (`backend/`) and frontend (`frontend/`) are deployment-ready; deployment configs (`render.yaml`, `vercel.json`) are included. If you're looking for the original, registration-based version that this replaced, it's preserved for reference under the original `backend/` and `frontend/` directory names before the rebuild — check your repo history if you need to distinguish them after merging.

## What this system does

- **Students** browse mentor availability and book appointment slots.
- **Mentors** manage their availability, approve or decline booking requests, and message students.
- **Admin** creates every account in the system — there is no self-registration. Admin also manages account status and (in the rebuilt version) views analytics on bookings across departments.

## Why it's being rebuilt

The original project worked, but had a few real issues that the rebuild specifically addresses:

- **Self-registration is gone.** Students and mentors used to register themselves through public forms. Now, admin creates every account (individually or via CSV bulk import), and the system emails/relays a temporary password that the new user must change on first login.
- **One login, not three.** The original had separate login endpoints per role (`/student/login`, `/teacher/login`) that happened to call the same logic. There's now a single `POST /api/v1/auth/login` — the account's role comes back in the response, and the frontend routes to the right dashboard from that, rather than the user needing to know in advance which login page to use.
- **A real authorization gap is closed.** Several admin routes in the original backend (`GET/PATCH/DELETE /admin/:id`) had no authentication middleware at all — anyone who knew or guessed a user's database ID could view, edit, or delete that account. The rebuilt admin router gates every route behind authentication and an admin-only check at once, rather than per-route.
- **Tokens expire properly.** The original issued a single JWT valid for 90 days with no way to revoke it short of changing the signing secret (which would log out every user at once). The rebuild uses a 15-minute access token plus a 7-day refresh token in an httpOnly cookie.
- **The appointment data model was redesigned.** The original stored every booking attempt for a time slot in an array on one document, which made "is this slot actually still available" an application-level question and meant the intended double-booking safeguard didn't reliably do what it looked like it was supposed to do. Appointments are now one document per slot, with the booking represented directly on that slot — so double-booking prevention is a single atomic database update, not a check-then-write race condition. (The original's check-then-write pattern in `bookAppointment` had exactly this race: two students could both pass the "already booked?" check and both get written, milliseconds apart, before either write was visible to the other.)
- **Notification emails no longer block API responses.** Approving or rejecting a booking used to `await` the email send inside the request — a slow or unreachable mail server meant the mentor's click just hung. Emails are now fire-and-forget; the booking change is saved and the response returns immediately regardless of mail delivery status.
- **Bookings and approvals now update live.** A persisted notification system plus Socket.IO push means a mentor sees a new booking request appear without refreshing, and a student sees an approval/rejection the moment it happens — backed by a database record so it's still there if they weren't online at the time.
- **The frontend now actually protects its routes.** The original had zero route guards — any dashboard URL was reachable by typing it directly into a browser, regardless of login state. Access tokens also lived in `localStorage` under inconsistent per-role keys, readable by any script on the page. The rebuilt frontend gates every dashboard behind a real auth/role check and keeps the access token in memory only, never in browser storage.
- **Approved appointments can now generate a Google Meet link automatically.** A mentor connects their Google Calendar once; every booking they approve afterward creates a calendar event with a Meet link, without either side needing to set one up manually. This is fully optional per mentor and never blocks an approval if it fails — see `backend/docs/08-phase7-calendar-integration.md`.
- **Admin now has a real analytics dashboard**, backed by a new durable booking-event log rather than just the current state of the appointments table — rejected bookings used to vanish the moment a slot was reused, making historical analytics like "how often does this mentor decline" silently wrong. See `backend/docs/09-phase8-admin-analytics.md`.
- **The backend moved off Vercel serverless** to a host that runs a persistent process (Render), since the original's serverless deployment is fundamentally incompatible with the Socket.IO real-time layer added in Phase 5 — a serverless function has no concept of a connection staying open between invocations. See `docs/10-phase9-deployment.md`.

See `docs/01-architecture-and-roadmap.md` for the full rationale behind every stack and schema decision, and the rest of the `docs/` folder for a phase-by-phase build log.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js, Express, **TypeScript** |
| Database | MongoDB + Mongoose (kept from the original; not migrating to PostgreSQL) |
| Auth | JWT (short-lived access token + httpOnly-cookie refresh token) |
| Validation | Zod |
| Real-time | Socket.IO *(done — Phase 5)* |
| Email | Nodemailer |
| Frontend | React + Vite + **TypeScript** |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query (React Query) |

## Rebuild progress

| Phase | What it covers | Status |
|---|---|---|
| 1 | Backend foundation — TypeScript config, env validation, DB connection, error handling | ✅ Done |
| 2 | Data layer — typed Mongoose models, slot/booking schema redesign | ✅ Done |
| 3 | Auth & RBAC — single login, admin-only account creation, CSV bulk import, access/refresh tokens | ✅ Done |
| 4 | Mentor & student modules — slot creation, atomic booking, approval workflow | ✅ Done |
| 5 | Real-time layer (Socket.IO) + notification plumbing | ✅ Done |
| 6 | Frontend rebuild — TypeScript + Vite, auth/route guards, 3 dashboards, real-time UI | ✅ Done |
| 7 | Google Calendar integration — OAuth connect, auto Meet links on approval | ✅ Done |
| 8 | Admin analytics dashboard — bookings by department, busiest mentors, response rate, turnaround | ✅ Done |
| 9 | Deployment — Vercel (frontend), Render (backend), MongoDB Atlas | ✅ Done |

**The 9-phase rebuild is complete.** See `docs/10-phase9-deployment.md` for the full deployment guide, including a production checklist and the specific platform details (current as of this writing) that were checked rather than assumed.

Each completed phase has its own doc in `docs/` with exact file-by-file instructions, the reasoning behind each decision, and what was actually tested versus reviewed-but-unverified.

## Getting started (local development)

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in DB_URL, JWT secrets, etc.
npm run seed             # creates test admin/mentor/student accounts
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env    # set VITE_BACKEND_URL
npm run dev
```

See `backend/README.md` and `frontend/README.md` for full setup guides, environment variable references, and test account credentials.

## Deployment

Frontend → Vercel, backend → Render (required for the Socket.IO real-time layer — see why in the deployment doc), database → MongoDB Atlas. Deployment configs are included: `backend/render.yaml` and `frontend/vercel.json`. Full walkthrough with a production checklist: `docs/10-phase9-deployment.md`.

## Original project credits

This system began as a MERN-stack student project (Student-Teacher Booking Appointment System). The rebuild keeps all of its core functionality — appointment booking, mentor approval workflows, email notifications, messaging — while addressing the architectural and security issues described above and adding the features listed in the roadmap.
