import { Appointment, IAppointment } from "../models/Appointment";
import { User } from "../models/User";
import { BookingEvent } from "../models/BookingEvent";
import { AppError } from "../utils/AppError";
import { sendMailAsync } from "./email.service";
import {
  bookingRequestEmail,
  bookingApprovedEmail,
  bookingRejectedEmail,
} from "../utils/emailTemplates";
import { formatAppointmentTime } from "../utils/formatDate";
import { CreateSlotInput } from "../validators/mentor.validators";
import { emitDomainEvent } from "../sockets/domainEvents";
import { createCalendarEvent } from "./calendar.service";

/**
 * Creates one open slot for a mentor. Double-booking the exact same
 * mentor+time is prevented by the unique compound index on the Appointment
 * model itself (see models/Appointment.ts) — if this throws a duplicate-key
 * error, it surfaces as a clean 409 here rather than a raw Mongo error
 * leaking to the client.
 */
export const createSlot = async (
  mentorId: string,
  input: CreateSlotInput
): Promise<IAppointment> => {
  try {
    const slot = await Appointment.create({
      mentorId,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
    });
    emitDomainEvent("appointment.slot_created", { mentorId, slot });
    return slot;
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      throw new AppError("You already have a slot at this exact time.", 409);
    }
    throw err;
  }
};

export const createSlotsBatch = async (
  mentorId: string,
  inputs: CreateSlotInput[]
): Promise<{ created: IAppointment[]; skipped: { scheduledAt: Date; reason: string }[] }> => {
  const created: IAppointment[] = [];
  const skipped: { scheduledAt: Date; reason: string }[] = [];

  for (const input of inputs) {
    try {
      const slot = await createSlot(mentorId, input);
      created.push(slot);
    } catch (err) {
      skipped.push({
        scheduledAt: input.scheduledAt,
        reason: err instanceof AppError ? err.message : "Failed to create slot",
      });
    }
  }

  return { created, skipped };
};

export const getMentorSlots = async (mentorId: string): Promise<IAppointment[]> => {
  return Appointment.find({ mentorId }).sort({ scheduledAt: 1 });
};

export const getMentorPendingBookings = async (mentorId: string): Promise<IAppointment[]> => {
  return Appointment.find({ mentorId, bookingStatus: "pending" })
    .populate("bookedBy", "_id name department email")
    .sort({ scheduledAt: 1 });
};

/**
 * The atomic booking claim. This is the actual fix for the original
 * double-booking problem: the filter requires status:"open" at the moment
 * of the update, and the update itself flips status to "booked" in the
 * same atomic operation. If two students hit this within milliseconds of
 * each other, only the first one's filter still matches — the second gets
 * `null` back and a clean "no longer available" error, never a silent
 * double-write.
 */
export const bookSlot = async (
  appointmentId: string,
  studentId: string
): Promise<IAppointment> => {
  const updated = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: "open" },
    {
      $set: {
        status: "booked",
        bookedBy: studentId,
        bookingStatus: "pending",
        bookedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!updated) {
    // Either it never existed, or someone else booked it a moment ago —
    // either way, the only honest answer to a 404-or-race is "not available".
    throw new AppError("This slot is no longer available.", 409);
  }

  const mentor = await User.findById(updated.mentorId);
  const student = await User.findById(studentId);
  if (mentor && student) {
    sendMailAsync({
      to: mentor.email,
      subject: "New appointment request",
      html: bookingRequestEmail(
        mentor.name,
        student.name,
        formatAppointmentTime(updated.scheduledAt)
      ),
    });
  }

  emitDomainEvent("appointment.booked", {
    mentorId: updated.mentorId.toString(),
    studentId,
    appointment: updated,
  });

  // Logged for analytics independent of the Appointment's own mutable
  // state — see BookingEvent.ts for why this can't just be derived from
  // the Appointment document later. Fire-and-forget: a logging failure
  // must never affect the booking itself, which has already succeeded.
  BookingEvent.create({
    appointmentId: updated._id,
    mentorId: updated.mentorId,
    studentId,
    eventType: "booked",
    scheduledAt: updated.scheduledAt,
    bookedAt: updated.bookedAt,
  }).catch((err) => console.error("[analytics] failed to log booking event:", err));

  return updated;
};

export const approveBooking = async (
  appointmentId: string,
  mentorId: string
): Promise<IAppointment> => {
  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, mentorId, status: "booked", bookingStatus: "pending" },
    { $set: { bookingStatus: "approved", respondedAt: new Date() } },
    { new: true }
  ).populate("bookedBy", "name email");

  if (!appointment) {
    throw new AppError("Pending booking not found for this slot.", 404);
  }

  const student = appointment.bookedBy as unknown as { name: string; email: string } | undefined;
  const mentor = await User.findById(mentorId);
  if (student && mentor) {
    sendMailAsync({
      to: student.email,
      subject: "Appointment confirmed",
      html: bookingApprovedEmail(
        student.name,
        mentor.name,
        formatAppointmentTime(appointment.scheduledAt)
      ),
    });
  }

  // Calendar sync is an enhancement, not a requirement — if the mentor
  // hasn't connected Google Calendar, createCalendarEvent returns null and
  // we just skip the meeting link. If Google's API itself errors (expired
  // refresh token, API outage, anything), the booking approval has
  // already succeeded above and must not be undone or fail because of it
  // — so this is wrapped in its own try/catch rather than left to bubble
  // up through the request handler.
  if (student && mentor) {
    try {
      const event = await createCalendarEvent(
        mentorId,
        student.email,
        student.name,
        appointment.scheduledAt,
        appointment.durationMinutes
      );
      if (event) {
        appointment.meetingLink = event.meetingLink;
        appointment.calendarEventId = event.eventId;
        await appointment.save();
      }
    } catch (err) {
      console.error("[calendar] failed to create event for approved booking:", err);
    }
  }

  emitDomainEvent("appointment.approved", {
    studentId: appointment.bookedBy!.toString(),
    appointment,
  });

  BookingEvent.create({
    appointmentId: appointment._id,
    mentorId,
    studentId: appointment.bookedBy!.toString(),
    eventType: "approved",
    scheduledAt: appointment.scheduledAt,
    bookedAt: appointment.bookedAt,
    respondedAt: appointment.respondedAt,
  }).catch((err) => console.error("[analytics] failed to log booking event:", err));

  return appointment;
};

/**
 * Rejecting a booking returns the slot to "open" rather than deleting it —
 * the original `dissapproveAppointment` pulled the student out of the
 * students[] array but left the slot itself untouched in a sense that
 * doesn't map cleanly here; with one-document-per-slot, "rejected" has to
 * either free the slot back up or kill it outright, and freeing it is the
 * more useful behavior for a real mentor (the time isn't wasted).
 */
export const rejectBooking = async (
  appointmentId: string,
  mentorId: string
): Promise<IAppointment> => {
  const appointment = await Appointment.findOne({
    _id: appointmentId,
    mentorId,
    status: "booked",
  });

  if (!appointment) {
    throw new AppError("Booking not found for this slot.", 404);
  }

  const student = await User.findById(appointment.bookedBy);
  const mentor = await User.findById(mentorId);
  const scheduledAt = appointment.scheduledAt;
  const rejectedStudentId = appointment.bookedBy!.toString();
  const respondedAt = new Date();
  const bookedAt = appointment.bookedAt;

  // Log BEFORE clearing bookedBy/bookingStatus below — those fields are
  // about to be wiped so the slot can be rebooked, and this is the only
  // remaining record that a rejection happened at all once that happens.
  BookingEvent.create({
    appointmentId: appointment._id,
    mentorId,
    studentId: rejectedStudentId,
    eventType: "rejected",
    scheduledAt,
    bookedAt,
    respondedAt,
  }).catch((err) => console.error("[analytics] failed to log booking event:", err));

  appointment.status = "open";
  appointment.bookedBy = undefined;
  appointment.bookingStatus = undefined;
  await appointment.save();

  if (student && mentor) {
    sendMailAsync({
      to: student.email,
      subject: "Appointment request declined",
      html: bookingRejectedEmail(student.name, mentor.name, formatAppointmentTime(scheduledAt)),
    });
  }

  emitDomainEvent("appointment.rejected", {
    studentId: rejectedStudentId,
    appointment,
  });

  return appointment;
};

export const deleteSlot = async (appointmentId: string, mentorId: string): Promise<void> => {
  const result = await Appointment.findOneAndDelete({ _id: appointmentId, mentorId });
  if (!result) {
    throw new AppError("Slot not found.", 404);
  }
  emitDomainEvent("appointment.slot_deleted", { mentorId, appointmentId });
};

const isDuplicateKeyError = (err: unknown): boolean => {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
};
