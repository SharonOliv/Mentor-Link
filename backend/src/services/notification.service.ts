import { Notification, INotification } from "../models/Notification";
import { NotificationType } from "../types/enums";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  message: string;
  relatedAppointmentId?: string;
}

export const createNotification = async (
  input: CreateNotificationInput
): Promise<INotification> => {
  return Notification.create(input);
};

export const getUnreadCount = async (userId: string): Promise<number> => {
  return Notification.countDocuments({ userId, read: false });
};

export const listNotifications = async (userId: string, limit = 50): Promise<INotification[]> => {
  return Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit);
};

export const markAsRead = async (notificationId: string, userId: string): Promise<void> => {
  await Notification.updateOne({ _id: notificationId, userId }, { $set: { read: true } });
};

export const markAllAsRead = async (userId: string): Promise<void> => {
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
};
