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

// Fast "unread notifications for this user" queries for the notification bell
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  notificationSchema
);
