import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Why this model exists: Appointment documents are mutable state, not
 * history. When a mentor rejects a booking, appointment.service.ts resets
 * the slot back to "open" and clears bookedBy/bookingStatus so it can be
 * booked again — that's the correct behavior for the booking flow itself,
 * but it means the fact that a rejection ever happened is gone the moment
 * the slot is reused. An analytics query run a week later would have no
 * way to count that rejection at all.
 *
 * This is a minimal, append-only event log written alongside (never
 * instead of) the Appointment mutations, specifically so analytics has a
 * durable record that survives the Appointment document's own state
 * changing. It is deliberately NOT a general-purpose audit log — just
 * enough fields to answer the specific questions the admin dashboard asks.
 */
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

const bookingEventSchema = new Schema<IBookingEvent>(
  {
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true },
    mentorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    eventType: {
      type: String,
      enum: ["booked", "approved", "rejected", "cancelled"],
      required: true,
    },
    scheduledAt: { type: Date, required: true },
    bookedAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookingEventSchema.index({ mentorId: 1, eventType: 1, createdAt: -1 });
bookingEventSchema.index({ createdAt: -1 });

export const BookingEvent: Model<IBookingEvent> = mongoose.model<IBookingEvent>(
  "BookingEvent",
  bookingEventSchema
);
