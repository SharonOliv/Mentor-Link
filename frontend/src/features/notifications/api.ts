import { api } from "../../api/client";
import { AppNotification } from "../../types";

export const fetchNotifications = async (): Promise<AppNotification[]> => {
  const { data } = await api.get<{ data: { notifications: AppNotification[] } }>(
    "/notifications"
  );
  return data.data.notifications;
};

export const fetchUnreadCount = async (): Promise<number> => {
  const { data } = await api.get<{ data: { count: number } }>("/notifications/unread-count");
  return data.data.count;
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await api.patch(`/notifications/${id}/read`);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await api.patch("/notifications/read-all");
};
