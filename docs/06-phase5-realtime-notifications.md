# Phase 5 — Real-Time Layer (Socket.IO + Notification Plumbing)

Live updates for bookings and approvals, plus the persisted notification system that backs them. Doing both together here rather than as fully separate phases (as the original roadmap sketched), because a real-time event that isn't also saved somewhere is useless to anyone who wasn't actively looking at their screen the moment it happened — the "live push" and "it's still there when you check later" parts are really one feature, not two.

---

## Architecture decision: an internal event bus between services and sockets

The straightforward way to add real-time updates would be importing the Socket.IO `io` instance directly into `appointment.service.ts` and calling `io.emit(...)` right where the booking happens. That works, but it means your business logic file now has a hard dependency on "however real-time delivery happens to be implemented today" — testing `bookSlot` in isolation means dealing with a live Socket.IO instance, and swapping real-time delivery for something else later (a message queue, a different library) means touching every service function that emits anything.

Instead, services emit plain domain events into a small internal event bus (`sockets/domainEvents.ts`, built on Node's built-in `EventEmitter` — no new dependency needed):

```typescript
emitDomainEvent("appointment.booked", { mentorId, studentId, appointment });
```

And exactly one file, `sockets/appointmentEvents.ts`, listens to that bus and decides what to actually do about it — emit a socket event, persist a notification, both. If you ever want to know "what happens when a booking is approved," this file is the single place to look, rather than something scattered across services.

```
                    emits domain event
appointment.service.ts ──────────────────► domainEvents (EventEmitter)
                                                    │
                                          listened to by
                                                    ▼
                                        sockets/appointmentEvents.ts
                                          │                    │
                                  io.emit(...)          createNotification(...)
                                  (live push)          (persisted, survives refresh)
```

---

## Files created in this phase

```
backend/src/
├── sockets/
│   ├── domainEvents.ts        # internal event bus (EventEmitter)
│   ├── index.ts                # Socket.IO server setup, JWT auth, room-per-user
│   └── appointmentEvents.ts    # maps domain events -> socket emits + notifications
├── services/
│   └── notification.service.ts # create, list, mark-read for persisted notifications
├── controllers/
│   └── notification.controller.ts
└── routes/
    └── notification.routes.ts
```

Modified: `services/appointment.service.ts` now calls `emitDomainEvent(...)` at every state-change point (slot created, booked, approved, rejected, slot deleted). `server.ts` now creates an explicit `http.Server` via Node's `createServer(app)` instead of letting `app.listen()` create one implicitly, since Socket.IO needs to attach to that same server object.

---

## How auth works for sockets

REST requests prove identity via the `Authorization` header on every request. Sockets are long-lived connections, so there's no per-request header — instead, the client sends its access token once, at connection time:

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const decoded = verifyAccessToken(token);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});
```

This reuses the exact same `verifyAccessToken` function REST routes use — no separate socket-specific auth scheme to maintain or get out of sync. The frontend connects like this (for reference, built in the frontend phase):
```javascript
const socket = io(BACKEND_URL, { auth: { token: accessToken } });
```

One real consequence worth knowing: since the access token is short-lived (15 minutes), a socket connection made with a token that later expires will need to reconnect with a fresh token after a refresh — the frontend's socket context (Phase 9) needs to handle reconnecting with an updated token, not just assume the original connection lasts forever. Noting this now so it's not a surprise later.

---

## Room model

Every connected socket joins a room named `user:<their own id>`. This is the simplest model that satisfies the roadmap's requirements:

- A mentor with two browser tabs open both join `user:<mentorId>` — emitting once to that room reaches both tabs.
- A booking notification only ever needs to reach one specific person (the mentor who owns the slot, or the student who made the booking) — there's no need for a broader "everyone watching this mentor" broadcast room in this phase. (The roadmap's "real-time slot availability" — students seeing a mentor's calendar update live while browsing — would need a `mentor-availability:<mentorId>` room that students join while viewing that mentor's page; that's a frontend-driven join/leave pattern worth adding when the student-facing availability browser UI is actually built in Phase 9, rather than now with no UI to test it against.)

---

## Events emitted

| Domain event | Socket event | Room | Also persists a Notification? |
|---|---|---|---|
| `appointment.slot_created` | `slot:created` | `user:<mentorId>` | No — this is a mentor's own action, no need to notify themselves |
| `appointment.booked` | `booking:requested` | `user:<mentorId>` | Yes — `booking_request` |
| `appointment.approved` | `booking:approved` | `user:<studentId>` | Yes — `booking_approved` |
| `appointment.rejected` | `booking:rejected` | `user:<studentId>` | Yes — `booking_rejected` |
| `appointment.slot_deleted` | `slot:deleted` | `user:<mentorId>` | No |
| *(any of the above with a persisted notification)* | `notification:new` | same room | — |

A frontend notification bell listens for `notification:new` for live updates, and calls `GET /api/v1/notifications` once on load to backfill anything that happened while the user wasn't connected.

---

## Notification API (new in this phase)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/notifications` | Most recent 50, any role — scoped to the logged-in user |
| GET | `/api/v1/notifications/unread-count` | For a badge count on the bell icon |
| PATCH | `/api/v1/notifications/:id/read` | Mark one as read |
| PATCH | `/api/v1/notifications/read-all` | Mark everything as read |

No `restrictTo(...)` on this router — notifications belong to whoever's logged in regardless of role, and every query is already scoped to `req.user.id`, so there's nothing role-specific to gate.

---

## A deliberate design choice worth understanding: independent failure paths

In `appointmentEvents.ts`, the socket emit and the notification persistence are two separate operations, not one thing that does both:

```typescript
domainEvents.on("appointment.booked", (payload) => {
  io.to(userRoom(payload.mentorId)).emit("booking:requested", payload.appointment);

  createNotification({...})
    .then((notification) => io.to(userRoom(payload.mentorId)).emit("notification:new", notification))
    .catch((err) => console.error(...));
});
```

If `createNotification` fails (a momentary DB hiccup), the live socket push still happened — the mentor sees the update in real time even though the persisted record didn't save. If the socket emit somehow failed, the notification still gets created and will show up next time they load `/notifications`. Neither failure mode silently breaks the other half of the feature. This mirrors the same "don't let one concern's failure take down an unrelated concern" principle from the fire-and-forget email pattern in Phase 4.

---

## Deployment consequence (flagged in Phase 1, now concrete)

`server.ts` no longer calls `app.listen()` — it creates an explicit `http.Server` via `createServer(app)` and Socket.IO attaches to that same object before `.listen()` is called on it. This is a real structural requirement, not a style choice, and it's also the concrete reason this backend can't run as a Vercel serverless function: a serverless function has no concept of a socket staying open between invocations. Render or Railway (or any host that runs your `node dist/server.js` as a continuously-running process) is required from this phase onward.

---

## What was tested vs. reviewed-but-unverified

**Verified by actually running (not just reading):**
- The internal event bus (`domainEvents`) actually delivers payloads to listeners, and correctly fires multiple listeners registered on the same event — compiled and ran this directly, it's pure `EventEmitter` logic with no database dependency.
- The JWT sign/verify cycle the socket auth middleware depends on — signed a token, decoded it back to the correct `id` and `role`, confirmed a tampered token and an empty string are both rejected. This is the exact logic `io.use(...)` runs on every incoming connection.

**Type-checked clean (verified):** every file in this phase, zero errors, against the full Phase 1–5 codebase.

**Reviewed carefully, not run end-to-end (the same honest gap as every phase so far, and the most relevant one yet):** I could not start a real Socket.IO server and have an actual client connect to it in this sandbox — that needs a live MongoDB for the auth middleware's nature (it doesn't query the DB directly, just verifies the JWT, so this part is lower-risk) but more importantly needs an actual running server process and a client to test the connection/room/emit cycle against, which is a bigger ask than the previous phases' "needs a database" gap. The code follows Socket.IO's documented patterns closely (auth middleware via `io.use`, rooms via `socket.join`), so I'm reasonably confident in it, but this is the phase where I'd most encourage you to actually run it and watch two browser tabs (or two terminal `socket.io-client` scripts) receive events from each other before building the frontend's real-time UI on top of it.

A good first manual test once the backend is running: open the browser dev console on two tabs logged in as the seeded mentor and student accounts, connect a socket from each with `io(url, { auth: { token } })`, have the student call `PATCH /student/slots/:id/book`, and confirm the mentor's tab receives a `booking:requested` event without refreshing.

---

**Next:** Phase 9 (frontend rebuild) is the natural next step now that there's a complete, real-time-capable backend to build a UI against — the auth context, protected routes, dashboards, and the socket connection on the client side all depend on what's been built through this phase. Alternatively, Phase 10 (Google Calendar integration) or Phase 11 (admin analytics) can go first if you'd rather finish out all backend features before touching the frontend at all. Say which, or "go" for frontend next.
