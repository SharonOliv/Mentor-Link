# Phase 2 — Data Layer (Typed Mongoose Models)

Goal: typed replacements for `User.js`, `Appointment.js`, `Message.js`, plus a new `Notification.ts` model — and the actual schema redesign from the roadmap doc (slot/booking split) implemented for real.

Since you're starting fresh with test data, there's no migration script needed — just create these files, then run the seed script at the end to get realistic test data.

---

## Two real bugs found in your current models, fixed here

**1. `User.js` had a hardcoded admin lockout.**
```js
userSchema.pre('save', async function(next) {
   if (this.id === '653d33213eefdbe85eb9cd59') return next()
   if (this.roles === 'admin') return next(new AppError('You are not the admin'))
   next()
})
```
This blocks creating **any** new admin account unless its MongoDB `_id` happens to match one specific hardcoded ID from whatever database the original developer was using. Since your entire redesign is "admin creates every account," this would silently break the most important account-creation path. Removed entirely in the new model — admin creation is now controlled by route-level RBAC middleware (Phase 3), which is the correct place for that check, not a model hook nobody would think to look in.

**2. `Appointment.js`'s double-booking index didn't actually work as intended.**
```js
appointmentSchema.index(
    { "students.studentId": 1 },
    { partialFilterExpression: { "students.studentId": null }, unique: true }
);
```
A partial unique index filtering on `"students.studentId": null` against an **array field** doesn't behave like a scalar null-check — MongoDB's partial filter expressions don't reliably target "this array has no elements" this way. This is the underlying reason your `teacherController.js` had to do manual clash-checking in application code (`checkTimeClash`) instead of trusting the database. The new slot/booking model below replaces this with a plain compound unique index on `{ mentorId, scheduledAt }`, which **does** work exactly as intended — two slots can't exist for the same mentor at the same time, full stop, enforced by MongoDB itself.

---

## Step 1 — Create: `backend/src/types/enums.ts`

**Why:** central place for the role/status/type enums used across multiple models — avoids typos like `"mentro"` slipping through because TypeScript will reject any string that isn't one of these exact literals.

```typescript
export type UserRole = "student" | "mentor" | "admin";
export type UserStatus = "active" | "disabled";

export type AppointmentStatus = "open" | "booked" | "completed" | "cancelled";
export type BookingStatus = "pending" | "approved" | "rejected" | "rescheduled";

export type NotificationType =
  | "booking_request"
  | "booking_approved"
  | "booking_rejected"
  | "reschedule_request"
  | "system";
```

Note: your original model called the field `roles` (plural) even though it only ever holds one value. Renamed to `role` (singular) since that's what it actually is — a one-to-one classification, not a list.

---

## Step 2 — Create: `backend/src/models/User.ts`

**Why:** typed version of your `User.js`, with the admin lockout removed, `age` made optional (it was required for every account including mentors/admins, which doesn't make sense), `passwordConfirm` removed (that's a registration-form concern — with admin-only account creation there's no public form to confirm against, so this field would just be dead weight), and a `mustChangePassword` flag added to support the "admin sets a temporary password, user changes it on first login" flow from the roadmap.

```typescript
import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "../types/enums";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  department?: string;
  subjects: string[];
  status: UserStatus;
  mustChangePassword: boolean;
  googleCalendarTokens?: {
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
      minlength: 8,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    role: {
      type: String,
      enum: ["student", "mentor", "admin"],
      required: true,
    },
    department: {
      type: String,
      trim: true,
    },
    subjects: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    googleCalendarTokens: {
      type: {
        accessToken: String,
        refreshToken: String,
        expiryDate: Number,
      },
      required: false,
      select: false,
    },
  },
  { timestamps: true }
);

// department is required for student/mentor accounts, optional for admin
userSchema.pre("validate", function (next) {
  if ((this.role === "student" || this.role === "mentor") && !this.department) {
    this.invalidate("department", "Department is required for students and mentors");
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.index(
  { department: 1, role: 1, status: 1 },
  { collation: { locale: "en", strength: 2 } }
);

export const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
```

A few details worth noting:
- `select: false` on `password` means `User.find()` never returns the password hash by default — you have to explicitly `.select("+password")` when you actually need it (login). Your original schema didn't do this, so every query that returned a user document was also returning their password hash to whatever called it.
- `comparePassword` is a method on the model now, replacing the manual `bcrypt.compare(...)` calls scattered through your controllers — one place to change the hashing logic if it ever needs to.
- Salt rounds bumped from 10 to 12 — a minor hardening, negligible performance cost.

---

## Step 3 — Create: `backend/src/models/Appointment.ts`

**Why:** this is the actual schema redesign. One document = one slot. A booking is represented by `bookedBy` + `bookingStatus` fields directly on that same document, not a sub-array. This is what makes double-booking prevention a real database guarantee instead of application-level array scanning.

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { AppointmentStatus, BookingStatus } from "../types/enums";

export interface IAppointment extends Document {
  mentorId: Types.ObjectId;
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  bookedBy?: Types.ObjectId;
  bookingStatus?: BookingStatus;
  meetingLink?: string;
  calendarEventId?: string;
  rescheduleRequestedAt?: Date;
  rescheduleProposedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 10,
    },
    status: {
      type: String,
      enum: ["open", "booked", "completed", "cancelled"],
      default: "open",
    },
    bookedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    bookingStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "rescheduled"],
      default: null,
    },
    meetingLink: {
      type: String,
      default: null,
    },
    calendarEventId: {
      type: String,
      default: null,
    },
    rescheduleRequestedAt: {
      type: Date,
      default: null,
    },
    rescheduleProposedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// The real double-booking guard — enforced by MongoDB itself, not app code
appointmentSchema.index({ mentorId: 1, scheduledAt: 1 }, { unique: true });

appointmentSchema.index({ bookedBy: 1, status: 1 });
appointmentSchema.index({ mentorId: 1, status: 1 });

export const Appointment: Model<IAppointment> = mongoose.model<IAppointment>(
  "Appointment",
  appointmentSchema
);
```

**How this maps to your existing workflow**, concretely:
- Mentor creates a slot → `Appointment.create({ mentorId, scheduledAt })`, status defaults to `"open"`.
- Student books it → atomic update: find one `Appointment` matching `{ _id, status: "open" }` and set `bookedBy`, `bookingStatus: "pending"`, `status: "booked"` in the same operation (`findOneAndUpdate` with that filter). If two students hit "book" on the same slot within milliseconds of each other, only the first one's filter still matches `status: "open"` — the second gets nothing back and a clean "slot no longer available" response, instead of both silently succeeding.
- Mentor approves → `bookingStatus: "approved"`, meeting link generated (Phase 10).
- Mentor rejects → `status` resets back to `"open"`, `bookedBy`/`bookingStatus` cleared — the slot becomes bookable again instead of being stuck.

This logic itself lives in the **service layer**, built in Phase 5/6 — this model file is just the shape.

---

## Step 4 — Create: `backend/src/models/Notification.ts`

**Why:** new — didn't exist in your original project. Backs the in-app notification bell and the real-time Socket.IO `notification:new` event from the roadmap. Persisting these (instead of only pushing over the socket) means a notification still shows up if the user wasn't online when it happened.

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { NotificationType } from "../types/enums";

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  message: string;
  read: boolean;
  relatedAppointmentId?: Types.ObjectId;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "booking_request",
        "booking_approved",
        "booking_rejected",
        "reschedule_request",
        "system",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    relatedAppointmentId: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  notificationSchema
);
```

---

## Step 5 — Create: `backend/src/models/Message.ts`

**Why:** your original model stored `from`/`to` as raw email strings, with no link back to the `User` collection. That means you can't `.populate()` sender details, there's no referential integrity if an email is ever corrected, and "all messages between these two users" has no efficient index to use. Switched to `ObjectId` refs.

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IMessage extends Document {
  from: Types.ObjectId;
  to: Types.ObjectId;
  messageText: string;
  read: boolean;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    from: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messageText: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ to: 1, read: 1 });

export const Message: Model<IMessage> = mongoose.model<IMessage>(
  "Message",
  messageSchema
);
```

---

## Step 6 — Seed script: `backend/src/scripts/seed.ts`

**Why:** you confirmed your current data is just test data, so rather than write a migration script for nothing, here's a seed script that creates one admin, a few mentors, and a few students with some sample appointments — gives you something real to test the rest of the build against.

```typescript
import { connectToDatabase } from "../config/db";
import { User } from "../models/User";
import { Appointment } from "../models/Appointment";
import mongoose from "mongoose";

const seed = async () => {
  await connectToDatabase();

  console.log("[seed] clearing existing test data...");
  await User.deleteMany({});
  await Appointment.deleteMany({});

  console.log("[seed] creating admin...");
  const admin = await User.create({
    email: "admin@university.edu",
    password: "Admin@12345",
    name: "System Admin",
    role: "admin",
  });

  console.log("[seed] creating mentors...");
  const mentor1 = await User.create({
    email: "priya.sharma@university.edu",
    password: "Mentor@12345",
    name: "Dr. Priya Sharma",
    role: "mentor",
    department: "Computer Science",
    subjects: ["Data Structures", "Algorithms"],
    mustChangePassword: false,
  });

  const mentor2 = await User.create({
    email: "james.okoro@university.edu",
    password: "Mentor@12345",
    name: "Dr. James Okoro",
    role: "mentor",
    department: "Mathematics",
    subjects: ["Calculus", "Linear Algebra"],
    mustChangePassword: false,
  });

  console.log("[seed] creating students...");
  const student1 = await User.create({
    email: "aisha.khan@university.edu",
    password: "Student@12345",
    name: "Aisha Khan",
    role: "student",
    department: "Computer Science",
    mustChangePassword: false,
  });

  const student2 = await User.create({
    email: "liam.chen@university.edu",
    password: "Student@12345",
    name: "Liam Chen",
    role: "student",
    department: "Mathematics",
    mustChangePassword: false,
  });

  console.log("[seed] creating appointment slots...");
  const now = new Date();
  const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  await Appointment.create([
    { mentorId: mentor1._id, scheduledAt: inDays(1), status: "open" },
    { mentorId: mentor1._id, scheduledAt: inDays(2), status: "open" },
    {
      mentorId: mentor1._id,
      scheduledAt: inDays(3),
      status: "booked",
      bookedBy: student1._id,
      bookingStatus: "pending",
    },
    { mentorId: mentor2._id, scheduledAt: inDays(1), status: "open" },
    {
      mentorId: mentor2._id,
      scheduledAt: inDays(2),
      status: "booked",
      bookedBy: student2._id,
      bookingStatus: "approved",
    },
  ]);

  console.log("[seed] done.");
  console.log("\nTest accounts (all use the password shown):");
  console.log("  Admin:   admin@university.edu / Admin@12345");
  console.log("  Mentor:  priya.sharma@university.edu / Mentor@12345");
  console.log("  Mentor:  james.okoro@university.edu / Mentor@12345");
  console.log("  Student: aisha.khan@university.edu / Student@12345");
  console.log("  Student: liam.chen@university.edu / Student@12345");

  await mongoose.connection.close();
  process.exit(0);
};

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
```

Add a script to `package.json`:
```json
"seed": "ts-node-dev --transpile-only src/scripts/seed.ts"
```

Run it:
```bash
npm run seed
```

---

## Verify Phase 2 works

```bash
npx tsc --noEmit
```
This compiles clean with zero errors against the Phase 1 foundation — confirmed.

**Honest note on the seed script:** the sandbox I'm working in can't reach a real MongoDB instance (no local `mongod` available, and MongoDB's binary/package download hosts aren't reachable from here), so I wasn't able to actually run `npm run seed` end-to-end and watch it write real documents. What I verified instead: every model compiles cleanly, the validation logic (department-required-for-student/mentor, password hashing, `comparePassword`) is standard Mongoose pattern that matches what's documented above, and the seed script's calls match each model's actual field names exactly (no typos like `roles` vs `role`). Run `npm run seed` against your own local MongoDB or Atlas connection — if anything doesn't match, the most likely cause would be a MongoDB version-specific quirk I can't see from here, not a logic error in the script itself.

Once it runs, you should see the seed log output ending in the test account list. Check your database with MongoDB Compass or `mongosh` — you should see 5 documents in `users` and 5 in `appointments`, with the new field shapes (`role` not `roles`, no `students[]` array on appointments).

A good first manual check once seeded: try creating a second admin account by hand (e.g. in `mongosh` or a quick script, `User.create({ email: "...", password: "...", name: "...", role: "admin" })`) — it should succeed without the old hardcoded-ID block.

---

**Next:** Phase 3 — the actual auth/RBAC rebuild: removing self-registration routes, building the single role-aware login endpoint, admin-driven user creation (including CSV bulk import), and access/refresh token issuance. This is the core pivot you asked for. Say "go" when ready.
