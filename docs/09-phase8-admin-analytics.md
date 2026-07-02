# Phase 8 — Admin Analytics Dashboard

Bookings by department, busiest mentors, approval/rejection rate, and approval turnaround time — the four metrics from the original roadmap brief, backed by real aggregation pipelines rather than client-side counting.

---

## A real schema gap this phase surfaced and fixed

Before writing a single aggregation query, a problem became obvious: **rejected bookings disappear**. Look at what `rejectBooking` does — it resets the slot's `status` back to `"open"` and clears `bookedBy`/`bookingStatus` so the slot can be booked again. That's correct behavior for the booking flow itself, but it means the moment a rejected slot gets rebooked by someone else, there is no longer any record on that `Appointment` document that a rejection ever happened. An analytics query run a week later asking "how many bookings has this mentor declined" would get a wrong answer — not because the query is broken, but because the data it would need was already overwritten by ordinary, correct, day-to-day use of the app.

The fix is a new model, `BookingEvent` — a minimal, append-only log written alongside (never instead of) the existing `Appointment` mutations:

```typescript
export type BookingEventType = "booked" | "approved" | "rejected" | "cancelled";

export interface IBookingEvent extends Document {
  appointmentId: Types.ObjectId;
  mentorId: Types.ObjectId;
  studentId: Types.ObjectId;
  eventType: BookingEventType;
  scheduledAt: Date;
  bookedAt?: Date;
  respondedAt?: Date;
  createdAt: Date;
}
```

Every place `appointment.service.ts` changes a booking's state now also writes one of these — `bookSlot` logs `"booked"`, `approveBooking` logs `"approved"`, and critically, `rejectBooking` logs `"rejected"` **before** it clears the fields that would otherwise be the only evidence the rejection happened:

```typescript
// Logged BEFORE clearing bookedBy/bookingStatus below — those fields are
// about to be wiped so the slot can be rebooked, and this is the only
// remaining record that a rejection happened at all once that happens.
BookingEvent.create({ appointmentId, mentorId, studentId, eventType: "rejected", ... })
  .catch((err) => console.error("[analytics] failed to log booking event:", err));

appointment.status = "open";
appointment.bookedBy = undefined;
appointment.bookingStatus = undefined;
await appointment.save();
```

This is the same fire-and-forget pattern as the email sending from Phase 4 — a logging failure here must never affect the booking operation itself, which has already succeeded by the time this runs.

---

## A second gap: there was no honest way to measure response time

The original `Appointment` model only had Mongoose's generic `createdAt`/`updatedAt`. Measuring "how long did the mentor take to respond to a booking" from those would have been wrong in a specific way: `updatedAt` changes on *any* field update — attaching a calendar link after approval, a reschedule, anything — not specifically on the approve/reject decision. Reusing it for turnaround-time analytics would have silently mixed in unrelated delays and produced numbers that looked precise but weren't measuring what they claimed to.

The fix: two new dedicated fields on `Appointment` (and mirrored onto `BookingEvent`), set exactly once, only at the moment that matters:

```typescript
bookedAt: Date | null;     // set in bookSlot, when the student claims it
respondedAt: Date | null;  // set in approveBooking / rejectBooking, when the mentor decides
```

`approvalTurnaroundStats()` computes `respondedAt - bookedAt` in minutes for every event that has both — a clean, specific measurement instead of an approximation borrowed from a field meant for something else.

---

## The four metrics and how each pipeline works

**Bookings by department** (`bookingsByDepartment`) — `Appointment` documents only carry `mentorId`, not department directly, so this does a `$lookup` against `users` to resolve each booking's mentor's department before grouping and counting. Counts every `"booked"` event ever logged, including ones later rejected — a department's real booking *demand* includes attempts that didn't end in an approval, not just the ones that did.

**Busiest mentors** (`busiestMentors`) — groups `BookingEvent` by `mentorId`, counting total bookings split by outcome (approved/rejected) in the same pass, sorted descending, limited, then joined against `users` for display names. "Busiest" alone doesn't tell an admin much without also seeing what happens to those bookings.

**Response rate** (`responseRateSummary`) — deliberately mixes two different data sources on purpose: approved/rejected counts come from the durable `BookingEvent` history, while the pending count comes from the live `Appointment` collection's current state. These really are two different kinds of question — "how many were ever approved vs rejected" is a history question, "how many are pending right now" is a live-state question — and conflating them into one source would either undercount history (if Appointments are the source) or treat "pending" as a completed event type it isn't (if BookingEvent is the only source).

**Approval turnaround** (`approvalTurnaroundStats`) — computes both mean and median minutes-to-respond. Median is reported as the primary headline figure on the dashboard, not mean, since response times are exactly the kind of data that's prone to a few extreme outliers (a mentor who took three days to respond once) — median is much less sensitive to that than mean.

---

## Files added in this phase

**Backend:**
```
backend/src/
├── models/BookingEvent.ts            # the new durable analytics log
├── services/analytics.service.ts      # the four aggregation pipelines + dashboard summary
├── controllers/analytics.controller.ts
└── routes/analytics.routes.ts
```
Modified: `models/Appointment.ts` (added `bookedAt`/`respondedAt`), `services/appointment.service.ts` (sets those fields and writes `BookingEvent` records at each state transition).

**Frontend:**
```
frontend/src/features/admin/
├── analyticsApi.ts
├── analyticsHooks.ts
├── StatCard.tsx
└── AnalyticsPage.tsx
```
Modified: `App.tsx` (new `/admin/analytics` route and nav item).

---

## A dependency worth flagging: recharts adds real bundle weight

Adding `recharts` for the department bar chart pushed the frontend's production bundle from roughly 350KB to roughly 720KB (pre-gzip) — Vite's build output warns about this directly. This is a real, honest tradeoff: a proper chart is more useful to an admin than a number-only table, but it's not free. If bundle size becomes a concern later, the straightforward fix is code-splitting the admin analytics route with a dynamic `import()` so non-admin users never download the charting library at all — noted here rather than silently accepted, since it's a real engineering decision, not an oversight.

---

## What was actually tested vs. reviewed-but-unverified

**Verified by actually running (not just reading):** the two pieces of math most likely to have an off-by-one or division-by-zero bug were extracted and tested directly, separate from any database:
- The median/average calculation, tested against an odd-length array, an even-length array (where median requires averaging the two middle values), a single-element array, and unsorted input — all four produced the mathematically correct result.
- The approval-rate calculation's zero-division guard — confirmed a system with zero responses yet returns `0`, not `NaN` (which would otherwise have silently broken the dashboard's percentage display on a brand-new install with no data).

Both backend (`npx tsc --noEmit`) and frontend (`npx tsc -b --noEmit`, plus a full `npm run build`) compile and bundle cleanly. The frontend's route guard was re-verified with the same headless-browser check used in every prior phase: navigating directly to `/admin/analytics` while logged out correctly redirects to `/login` with zero uncaught exceptions, confirming the new chart-heavy page didn't introduce any crash risk even before a user can reach it.

**Reviewed carefully, not run end-to-end (the same consistent gap, now applying to aggregation pipelines specifically):** the actual MongoDB aggregation pipelines — the `$lookup` joins, the `$group`/`$cond` counting, the full `getDashboardSummary` composition — were written carefully against MongoDB's documented aggregation semantics but could not be run against a real, populated database in this sandbox for the same networking reason as every prior phase. Aggregation pipelines are exactly the kind of code most likely to have a subtle bug that only shows up against real data (an unexpected `null`, a `$lookup` that doesn't match because of a type mismatch between an ObjectId and a string, etc.) — this is the part of this phase I'd most encourage you to check yourself: run the seed script, book and approve/reject a few appointments by hand, and confirm `GET /api/v1/analytics/summary` returns numbers that actually match what you just did before trusting this dashboard with real data.

---

**Next:** deployment is the last item on the original roadmap — Vercel for the frontend, Render or Railway for the backend (required for the persistent Socket.IO connections from Phase 5), and MongoDB Atlas for the database. Say "go" when ready.
