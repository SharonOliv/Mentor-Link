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
