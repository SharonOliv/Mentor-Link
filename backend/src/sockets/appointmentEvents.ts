import { Server as SocketIOServer } from "socket.io";
import { domainEvents } from "./domainEvents";
import { userRoom } from "./index";
import { createNotification } from "../services/notification.service";
import { formatAppointmentTime } from "../utils/formatDate";

interface SlotCreatedPayload {
  mentorId: string;
  slot: { _id: unknown };
}

interface BookedPayload {
  mentorId: string;
  studentId: string;
  appointment: { _id: unknown; scheduledAt: Date };
}

interface ApprovedOrRejectedPayload {
  studentId: string;
  appointment: { _id: unknown; scheduledAt: Date };
}

interface SlotDeletedPayload {
  mentorId: string;
  appointmentId: string;
}

/**
 * One place that knows how each domain event maps to (a) a persisted
 * Notification document and (b) a live socket emission. Keeping this
 * mapping in one file means "what does the frontend receive, and what
 * shows up later in the notification bell, when X happens" is answerable
 * by reading this file top to bottom, instead of being scattered across
 * every service that happens to care about real-time updates.
 *
 * Each handler does the DB write and the socket emit independently — if
 * persisting the notification fails, the live socket push still happens
 * (and vice versa), since a transient DB hiccup shouldn't also kill the
 * real-time UX, and a momentary socket issue shouldn't stop the
 * notification from existing for later.
 */
export const registerAppointmentEventListeners = (io: SocketIOServer): void => {
  domainEvents.on("appointment.slot_created", (payload: SlotCreatedPayload) => {
    io.to(userRoom(payload.mentorId)).emit("slot:created", payload.slot);
  });

  domainEvents.on("appointment.booked", (payload: BookedPayload) => {
    io.to(userRoom(payload.mentorId)).emit("booking:requested", payload.appointment);

    createNotification({
      userId: payload.mentorId,
      type: "booking_request",
      message: `New appointment request for ${formatAppointmentTime(payload.appointment.scheduledAt)}`,
      relatedAppointmentId: String(payload.appointment._id),
    })
      .then((notification) => {
        io.to(userRoom(payload.mentorId)).emit("notification:new", notification);
      })
      .catch((err) => console.error("[notifications] failed to persist booking_request:", err));
  });

  domainEvents.on("appointment.approved", (payload: ApprovedOrRejectedPayload) => {
    io.to(userRoom(payload.studentId)).emit("booking:approved", payload.appointment);

    createNotification({
      userId: payload.studentId,
      type: "booking_approved",
      message: `Your appointment for ${formatAppointmentTime(payload.appointment.scheduledAt)} was approved`,
      relatedAppointmentId: String(payload.appointment._id),
    })
      .then((notification) => {
        io.to(userRoom(payload.studentId)).emit("notification:new", notification);
      })
      .catch((err) => console.error("[notifications] failed to persist booking_approved:", err));
  });

  domainEvents.on("appointment.rejected", (payload: ApprovedOrRejectedPayload) => {
    io.to(userRoom(payload.studentId)).emit("booking:rejected", payload.appointment);

    createNotification({
      userId: payload.studentId,
      type: "booking_rejected",
      message: `Your appointment request for ${formatAppointmentTime(payload.appointment.scheduledAt)} was declined`,
      relatedAppointmentId: String(payload.appointment._id),
    })
      .then((notification) => {
        io.to(userRoom(payload.studentId)).emit("notification:new", notification);
      })
      .catch((err) => console.error("[notifications] failed to persist booking_rejected:", err));
  });

  domainEvents.on("appointment.slot_deleted", (payload: SlotDeletedPayload) => {
    io.to(userRoom(payload.mentorId)).emit("slot:deleted", { id: payload.appointmentId });
  });
};
