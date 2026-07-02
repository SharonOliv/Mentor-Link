# Faculty Appointment Management System — Production Roadmap

**Stack decision:** Node.js + Express + **TypeScript** + **MongoDB/Mongoose** (kept from your existing project) + React + Vite + Tailwind on the frontend. No Prisma, no PostgreSQL — your current database layer is fine, we're adding types and structure on top of it, not replacing the engine.

This doc is the map. We build it phase by phase as real files in this chat, starting with Phase 1.

---

## 1. What your current project already has (don't lose this)

Mapped from your ZIP, so we know exactly what "don't remove features" means in practice:

| Feature | Where it lives today |
|---|---|
| JWT login (shared across roles) | `authController.js` → `login`, `verifyToken` |
| Role-based middleware | `adminController.js` → `allow(...roles)` |
| Admin creates teacher accounts | `adminController.js` → `createTeacher` |
| Admin approves/rejects/deletes students | `adminController.js` → `approveStudent`, `deleteStudent` |
| Teacher creates appointment slots, with clash detection | `teacherController.js` → `createAppointment`, `checkTimeClash` |
| Student books a slot | `studentController.js` → `bookAppointment` |
| Teacher approves/rejects a booking | `teacherController.js` → `approveAppointment`, `dissapproveAppointment` |
| Email notifications (Nodemailer) | `utils/sendEmail.js`, used in admin/teacher/student controllers |
| Messages between student/teacher | `messageController.js`, `models/Message.js` |
| Student self-registration | `studentController.js` → `register` ← **being removed per your request** |

This is a real, working backend. The gaps are: no TypeScript, no real-time layer, self-registration that needs to disappear, thin validation, and a frontend that has separate login forms per role instead of one role-aware login.

---

## 2. Target Architecture

```
faculty-appointment-system/
├── backend/
│   ├── src/
│   │   ├── config/              # env loading, db connection, constants
│   │   ├── models/               # Mongoose schemas (typed)
│   │   ├── controllers/          # request handlers (thin)
│   │   ├── services/             # business logic (the actual brains)
│   │   ├── routes/               # express routers
│   │   ├── middleware/           # auth, RBAC, validation, error handling
│   │   ├── validators/           # zod schemas per route
│   │   ├── sockets/              # Socket.IO event handlers
│   │   ├── jobs/                 # scheduled tasks (reminders, cleanup)
│   │   ├── utils/                # AppError, catchAsync, email, calendar
│   │   ├── types/                # shared TS types/interfaces
│   │   └── server.ts             # composition root
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/                  # axios instance + endpoint functions
│   │   ├── components/           # reusable UI building blocks
│   │   ├── features/             # feature-folder: auth, appointments, admin, notifications
│   │   ├── layouts/               # DashboardLayout, AuthLayout
│   │   ├── pages/                 # route-level components
│   │   ├── context/               # AuthContext, SocketContext
│   │   ├── hooks/                  # useAuth, useSocket, useAppointments
│   │   ├── routes/                 # ProtectedRoute, RoleRoute, router config
│   │   ├── types/                   # shared TS interfaces matching backend
│   │   └── main.tsx
│   ├── .env.example
│   └── package.json
│
└── README.md
```

**Why `services/` separate from `controllers/`:** your current controllers mix HTTP concerns (req/res) with business logic (clash detection, email sending). Splitting these means the business logic is testable without spinning up Express, and controllers become 5-10 lines each.

**Why feature-folders on the frontend instead of pure type-folders:** `components/Login/StudentForm.jsx`, `TeacherForm.jsx`, `AdminForm.jsx` become **one** `LoginForm` once login is role-agnostic — feature folders make it obvious that auth UI, logic, and API calls for "login" live together.

---

## 3. Tech Stack (final)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast dev server, your existing React code carries over |
| Styling | Tailwind CSS | Already in your project |
| Data fetching/cache | React Query (TanStack Query) | Replaces manual `useEffect` + `axios` + loading-state juggling |
| Routing | React Router v6 | Already in your project |
| Backend | Node.js + Express + TypeScript | Typed version of what you have |
| Database | MongoDB + Mongoose | Kept — your schema is reasonable, just needs typing + indexes fixed |
| Auth | JWT (access + refresh token pair) | Upgrade from your single long-lived token |
| Validation | Zod | Catches bad payloads before they hit Mongoose |
| Real-time | Socket.IO | Live slot availability, booking status, notifications |
| Email | Nodemailer (kept) + queued sending | You already use Nodemailer; we just stop blocking the HTTP response on it |
| Calendar | Google Calendar API (OAuth2, optional per mentor) | Auto-creates calendar events + Meet links on approval |
| Notifications | In-app (Socket.IO + Mongo collection) + email | No new infra needed |
| Deployment | Vercel (frontend) + Render or Railway (backend, since Vercel serverless doesn't hold persistent Socket.IO connections well) + MongoDB Atlas | Realistic free-tier-friendly setup |

**One real constraint to flag honestly:** Vercel's serverless functions are not a good home for a long-lived Socket.IO server (no persistent connections, cold starts kill sockets). Frontend stays on Vercel; backend (Express + Socket.IO) goes on Render or Railway, both of which have a free tier and support long-running Node processes. I'll give exact steps for both in the deployment phase.

---

## 4. Authentication & RBAC — the actual redesign

This is the core change you asked for. Here's exactly how it will work:

1. **No self-registration routes at all** — `student/register` is deleted, not hidden.
2. **Admin creates every account** (student, mentor, or admin) through one `POST /api/v1/admin/users` endpoint, with `role` as a required field. Admin can also **bulk-import** students via CSV upload (common real-world need — onboarding a whole cohort).
3. **One login endpoint**: `POST /api/v1/auth/login` takes `{ email, password }` only. The backend looks up the user, and the **JWT payload carries `role`**. There is no "which form did you submit" — the role is a property of the account, not the page you visited.
4. **Frontend has one `<LoginPage />`**. After login succeeds, it reads `role` from the decoded token/response and `navigate()`s to `/student/dashboard`, `/mentor/dashboard`, or `/admin/dashboard`. Visiting the wrong dashboard URL directly redirects you out via a `RoleRoute` guard.
5. **First-login password change is mandatory** for accounts created by admin import, since admin sets a temporary password. This is the realistic flow universities actually use (and avoids admins knowing users' permanent passwords).
6. **Refresh tokens** replace your current single 90-day token — short-lived access token (15 min) + long-lived refresh token (7 days, httpOnly cookie), so a leaked access token expires fast.

---

## 5. Real-Time & Modern Features — what's actually being added, mapped to mechanism

| Feature | Mechanism |
|---|---|
| Real-time appointment updates | Socket.IO room per user; `appointment:updated` event |
| Live notifications | Socket.IO `notification:new` + persisted `Notification` collection so they survive a refresh |
| Prevent double booking | Mongo unique compound index + transaction-style check-then-write with retry, **not** just client-side disabling |
| Real-time slot availability | Mentor's open slots broadcast on creation/deletion; students' calendar view subscribes to mentor's room |
| Mentor approval workflow | Existing `approveAppointment`/`dissapproveAppointment`, now emits socket events + queues email instead of blocking on `await sendMail` |
| Rescheduling requests | New `RescheduleRequest` sub-flow: student proposes new time, mentor approves/declines, doesn't silently overwrite the original slot |
| Appointment status tracking | New explicit `status` enum: `pending → approved → completed / cancelled / rescheduled` instead of just a boolean `approved` |
| Meeting links | Auto-generated Google Meet link via Calendar API when an appointment is approved, stored on the appointment |
| Google Calendar integration | Mentor connects calendar once (OAuth2); approved appointments create calendar events automatically |
| Admin analytics dashboard | Aggregation pipeline endpoints: bookings per department, busiest mentors, no-show-ish cancellation rate, approval turnaround time |

---

## 6. Database Design

### Collections

**User** (extends your current schema)
| Field | Type | Constraint |
|---|---|---|
| `_id` | ObjectId | PK |
| `email` | String | unique, required, lowercase |
| `password` | String | required, hashed, select:false |
| `name` | String | required |
| `role` | enum: `student`,`mentor`,`admin` | required |
| `department` | String | required for student/mentor |
| `subjects` | [String] | mentor only |
| `mustChangePassword` | Boolean | default true on admin-created accounts |
| `status` | enum: `active`,`disabled` | default `active` — admin can deactivate without deleting |
| `googleCalendarTokens` | Object (encrypted) | mentor only, optional |
| `createdAt` / `updatedAt` | Date | timestamps |

**Appointment** (replaces the array-of-students model with one row per slot + one row per booking, see below)
| Field | Type | Constraint |
|---|---|---|
| `_id` | ObjectId | PK |
| `mentorId` | ObjectId → User | required |
| `scheduledAt` | Date | required |
| `durationMinutes` | Number | default 30 |
| `status` | enum: `open`,`booked`,`completed`,`cancelled` | default `open` |
| `bookedBy` | ObjectId → User | nullable |
| `bookingStatus` | enum: `pending`,`approved`,`rejected`,`rescheduled` | nullable |
| `meetingLink` | String | nullable, set on approval |
| `calendarEventId` | String | nullable |

> **Why this changes from your current "students array on one appointment" model:** your current schema lets multiple students sit in one `Appointment.students[]` array with per-student `approved` flags, which is really "many bookings against one slot" without a clean way to say the slot is now full. Splitting **slot** (one mentor, one time, capacity) from **booking** (one student, one slot, one status) makes double-booking prevention a single unique index instead of application-level array-scanning, which is what `checkTimeClash` is working around today.

**Notification**
| Field | Type |
|---|---|
| `userId` | ObjectId → User |
| `type` | enum: `booking_request`,`booking_approved`,`booking_rejected`,`reschedule_request`,`system` |
| `message` | String |
| `read` | Boolean, default false |
| `relatedAppointmentId` | ObjectId, nullable |
| `createdAt` | Date |

**Message** (kept from your existing model, lightly typed)

### Relationships
- `User (mentor) 1 — N Appointment` (slots they own)
- `User (student) 1 — N Appointment` (slots they've booked, via `bookedBy`)
- `User 1 — N Notification`
- `Appointment 1 — 1 Notification` (optional link back)

### Key indexes
- `User.email` — unique
- `Appointment` compound unique on `{ mentorId, scheduledAt }` — this is your double-booking guard, enforced at the database level, not just in controller code
- `Appointment.bookedBy` — sparse index for fast "my bookings" queries

---

## 7. Development Roadmap

**Phase 1 — Backend foundation**
TypeScript config, folder structure, env handling, DB connection, error handling middleware, logging.

**Phase 2 — Data layer**
Typed Mongoose models (User, Appointment, Notification, Message), migration script for any existing data.

**Phase 3 — Auth & RBAC rebuild**
Remove self-registration. Build admin-driven user creation (single + CSV bulk import). Role-aware login. Access/refresh tokens. `RoleRoute` guard on frontend.

**Phase 4 — Admin module**
User CRUD, bulk import, account activation/deactivation, analytics aggregation endpoints.

**Phase 5 — Mentor module**
Slot creation with clash prevention, approval/rejection workflow, Google Calendar connect.

**Phase 6 — Student module**
Browse mentor availability, book slot, reschedule requests, view booking history.

**Phase 7 — Real-time layer**
Socket.IO server, room-per-user model, live slot updates, live notification delivery.

**Phase 8 — Notifications**
Persisted notification collection, email queueing (stop blocking requests on `sendMail`), notification bell UI.

**Phase 9 — Frontend rebuild**
Auth context, protected/role routes, dashboard layouts, React Query integration, replace per-role forms with shared components.

**Phase 10 — Calendar & meeting links**
Google OAuth2 flow for mentors, event creation + Meet link generation on approval.

**Phase 11 — Admin analytics dashboard**
Charts for bookings/department, mentor load, approval turnaround.

**Phase 12 — Deployment**
Frontend → Vercel, backend → Render/Railway, MongoDB Atlas, environment variables, production checklist.

We'll build these in order, as real files, starting with **Phase 1** next.

---

## 8. A note on pace

The original ask included "generate all complete code for every file, file-by-file, in one go." I'm building this with you phase by phase instead — each phase produces real, working files you create in VS Code and test before moving on. This avoids two failure modes: getting 40 files of code with no chance to catch a mistake before it propagates, and hitting response limits halfway through a file. Same end result, safer path there.

Ready to start Phase 1 whenever you are — just say go.
