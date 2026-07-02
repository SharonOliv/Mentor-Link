# Phase 4 — Mentor & Student Modules (Appointment Workflow)

This phase implements the actual booking loop: mentors create availability slots, students browse and book them, mentors approve or reject, and the atomic claim logic that makes double-booking structurally impossible rather than just unlikely.

Building mentor and student together here, rather than as separate phases, because neither side is testable alone — there's no point in a mentor creating slots with no way to book them, and no point in booking logic with nothing to book.

---

## The core fix: atomic slot claiming

This is worth understanding on its own before looking at the file list, because it's the actual answer to "prevent double booking" from your original spec, and it's different from how the original codebase tried to do it.

The original `bookAppointment` did this:
```js
const existingStudent = await Appointment.findOne({ "students.studentId": req.user.id });
if (existingStudent) { return next(new AppError("...")); }
const newAppointment = await Appointment.findOneAndUpdate(
  { _id: req.params.id },
  { $push: { students: { studentId: req.user.id, approved: false } } },
  { new: true }
);
```
Two separate database operations: a **check**, then a **write**. Between those two calls, another student's request can land on the exact same slot — both checks see "not booked yet," both pushes succeed, and now one slot has two students booked on it. This is a textbook race condition, and the gap between check and write can be milliseconds, but milliseconds are exactly the timescale concurrent requests happen on.

The new `bookSlot` in `appointment.service.ts` does it differently:
```typescript
const updated = await Appointment.findOneAndUpdate(
  { _id: appointmentId, status: "open" },
  { $set: { status: "booked", bookedBy: studentId, bookingStatus: "pending" } },
  { new: true }
);
if (!updated) throw new AppError("This slot is no longer available.", 409);
```
One database operation. The filter `{ _id: appointmentId, status: "open" }` and the update happen atomically — MongoDB guarantees no other operation can interleave between "check status" and "set status," because they're the same operation. If two students call this within the same millisecond, exactly one `findOneAndUpdate` matches (because the instant the first one flips `status` to `"booked"`, the second one's filter no longer matches anything), and the second gets `null` back, becoming a clean 409 instead of a silent double-booking.

This is the entire reason the Appointment schema redesign happened in Phase 2 — a slot/array hybrid model can't get this atomicity property as cleanly as one-document-per-slot can.

---

## Files created in this phase

```
backend/src/
├── services/
│   ├── email.service.ts             # fire-and-forget mail sending
│   ├── appointment.service.ts        # slot creation, atomic booking, approve/reject
│   └── studentAppointment.service.ts # student-side browsing queries
├── utils/
│   ├── emailTemplates.ts             # HTML email bodies as pure functions
│   └── formatDate.ts                 # human-readable appointment time formatting
├── validators/
│   ├── mentor.validators.ts          # slot creation (single + batch)
│   └── student.validators.ts
├── controllers/
│   ├── mentor.controller.ts
│   └── student.controller.ts
└── routes/
    ├── mentor.routes.ts
    └── student.routes.ts
```

Also modified: `services/admin.service.ts` now actually emails the temp password to a newly-created user (it only returned it in the API response before — both happen now, matching how the original codebase's email-on-approval pattern worked elsewhere).

---

## A second real bug fixed here: blocking on email

The original `approveAppointment` and `dissapproveAppointment` controllers did:
```js
let info = await transporter.sendMail({ ... });
res.status(200).json({ message: "Approved" });
```
The HTTP response doesn't go out until the email send finishes. If your SMTP provider is slow (Gmail's SMTP can take a second or more under load) or briefly unreachable, the mentor clicking "approve" just sits there waiting — and if the mail server is actually down, the request can hang until it times out or errors, even though the approval itself was already saved to the database before the `sendMail` call.

`email.service.ts`'s `sendMailAsync` doesn't `await` the send at all — it fires the promise and attaches a `.catch()` that just logs failures:
```typescript
export const sendMailAsync = (input: MailInput): void => {
  getTransporter().sendMail({...}).catch((err) => {
    console.error(`[email] failed to send "${input.subject}" to ${input.to}:`, err.message);
  });
};
```
The database write (the actual approval) and the HTTP response both complete immediately regardless of mail server health. The email either arrives a moment later or, if something's wrong with SMTP, fails silently from the user's perspective but loudly in your server logs — which is the right trade-off, since a booking approval failing because of an unrelated email provider outage would be a strange thing for a mentor to have to debug.

---

## API surface added in this phase

### Mentor — `/api/v1/mentor` (all routes require `role: "mentor"`)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/slots` | — | All of this mentor's slots, any status |
| POST | `/slots` | `{ scheduledAt, durationMinutes? }` | `scheduledAt` must be in the future; duplicate exact-time slot returns 409 |
| POST | `/slots/batch` | `{ slots: [...] }` | Up to 100 at once; each succeeds/fails independently |
| DELETE | `/slots/:id` | — | Only deletes if it belongs to this mentor |
| GET | `/bookings/pending` | — | Slots with `bookingStatus: "pending"`, student details populated |
| PATCH | `/bookings/:id/approve` | — | Must currently be pending; emails the student |
| PATCH | `/bookings/:id/reject` | — | Returns the slot to `"open"` rather than deleting it — the time isn't wasted, a different student can book it |

### Student — `/api/v1/student` (all routes require `role: "student"`)

| Method | Path | Notes |
|---|---|---|
| GET | `/mentors` | Optional `?department=` filter. Excludes disabled mentor accounts. |
| GET | `/mentors/:mentorId/slots` | Only `status: "open"` slots — a student never sees someone else's already-booked slot |
| PATCH | `/slots/:id/book` | The atomic claim — see above. 409 if already taken |
| GET | `/bookings` | This student's own bookings, any status, mentor details populated |

A deliberate omission worth naming: there is no `DELETE /student/bookings/:id` (student cancels their own booking) yet. The roadmap's "rescheduling requests" feature in a later phase covers this properly — a plain cancel-and-reopen is easy to bolt on now, but the reschedule flow needs the same underlying state transition, so it's worth doing once, correctly, rather than building a throwaway cancel endpoint now and a separate reschedule endpoint later that doesn't reuse it.

---

## What was tested vs. reviewed-but-unverified

**Verified by actually compiling and running (not just reading):** the Zod validators in `mentor.validators.ts` — confirmed a slot scheduled in the past is rejected, a slot in the future passes with the default 30-minute duration, an out-of-range duration (999 minutes) is rejected, and a batch of valid slots passes while an empty batch is rejected. These are pure functions with no database dependency, so I could run them directly and confirm the actual behavior rather than just inspecting the code.

**Type-checked clean (verified):** every file in this phase, against the full Phase 1–4 codebase, zero TypeScript errors.

**Reviewed carefully, not run end-to-end (the honest gap, consistent with every phase so far):** the actual atomic-update behavior of `bookSlot` under real concurrent load needs a live MongoDB and ideally two simultaneous requests to prove the race condition is actually closed, not just theoretically closed. I can't run that here for the same sandbox networking reason as previous phases. The pattern itself — atomic `findOneAndUpdate` with the precondition in the filter — is a standard, well-established MongoDB technique for exactly this problem, so I'm confident in the design, but **you should specifically test this one**, since it's the single most important correctness property in the whole booking system. A reasonable test once you have this running: open two terminal tabs, get two different students' access tokens, and fire `PATCH /student/slots/:id/book` from both at nearly the same time against the same slot ID — exactly one should succeed, the other should get a 409.

---

**Next:** Phase 7 — the real-time layer (Socket.IO), so booking/approval changes show up live instead of requiring a refresh. Or Phase 8 (notifications) first if you'd rather get the in-app notification bell working before real-time push. Say which, or "go" for the default roadmap order (real-time next).
