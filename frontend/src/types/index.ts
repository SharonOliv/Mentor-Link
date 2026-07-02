export type UserRole = "student" | "mentor" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

export type AppointmentStatus = "open" | "booked" | "completed" | "cancelled";
export type BookingStatus = "pending" | "approved" | "rejected" | "rescheduled";

export interface Appointment {
  _id: string;
  mentorId: string | { _id: string; name: string; department?: string; email?: string };
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  bookedBy?: string | { _id: string; name: string; department?: string; email?: string };
  bookingStatus?: BookingStatus;
  meetingLink?: string;
}

export interface Mentor {
  _id: string;
  name: string;
  department: string;
  subjects: string[];
}

export type NotificationType =
  | "booking_request"
  | "booking_approved"
  | "booking_rejected"
  | "reschedule_request"
  | "system";

export interface AppNotification {
  _id: string;
  type: NotificationType;
  message: string;
  read: boolean;
  relatedAppointmentId?: string;
  createdAt: string;
}

export interface ApiError {
  status: "fail" | "error";
  message: string;
}
