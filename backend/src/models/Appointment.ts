import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { AppointmentStatus, BookingStatus } from "../types/enums";

/**
 * Redesign note (see roadmap doc, section 6):
 * The original model stored one Appointment per mentor-created slot, with a
 * `students[]` array holding every booking attempt against that slot. That
 * makes "is this slot still available" an application-level question (scan
 * the array, check approved flags) instead of a database-level guarantee,
 * and the original partial-unique-index attempt to prevent double booking
 * doesn't actually work against an array field the way it looks like it
 * should.
 *
 * Here, one Appointment document IS one slot. A booking is represented by
 * `bookedBy` + `bookingStatus` directly on the slot. A student booking a
 * slot is a single atomic update from status "open" to "booked" — if two
 * students hit the same open slot at once, the compound unique index plus
 * the conditional update in the service layer (Phase 5/6) ensures only one
 * wins, with no array-scanning required.
 */

export interface IAppointment extends Document {
  mentorId: Types.ObjectId;
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  bookedBy?: Types.ObjectId;
  bookingStatus?: BookingStatus;
  bookedAt?: Date;
  respondedAt?: Date;
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
    // Set explicitly when a student books a slot — kept separate from the
    // generic `createdAt` (which marks when the *slot* was created by the
    // mentor, possibly days earlier) so analytics on "how long did approval
    // take" measure from the actual booking moment, not the slot's age.
    bookedAt: {
      type: Date,
      default: null,
    },
    // Set explicitly when a mentor approves or rejects — kept separate from
    // the generic `updatedAt`, which changes on any field update at all
    // (a reschedule, a calendar link being attached after the fact, etc.)
    // and would silently corrupt turnaround-time analytics if reused here.
    respondedAt: {
      type: Date,
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

// This is the actual double-booking guard: one mentor cannot have two slots
// at the exact same scheduled time. Clean, enforced by the database, no
// array-scanning needed.
appointmentSchema.index({ mentorId: 1, scheduledAt: 1 }, { unique: true });

// Fast lookups for "my bookings" (student dashboard) and "my slots" (mentor dashboard)
appointmentSchema.index({ bookedBy: 1, status: 1 });
appointmentSchema.index({ mentorId: 1, status: 1 });

export const Appointment: Model<IAppointment> = mongoose.model<IAppointment>(
  "Appointment",
  appointmentSchema
);
