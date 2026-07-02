import { useNotifications, useMarkAsRead, useMarkAllAsRead } from "../notifications/useNotifications";
import { Button } from "../../components/Button";
import { formatDateTime } from "../../utils/formatDate";
import clsx from "clsx";

export const NotificationsPage = () => {
  const { data: notifications, isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Notifications</h1>
        {!!notifications?.some((n) => !n.read) && (
          <Button variant="ghost" size="sm" onClick={() => markAllAsRead.mutate()}>
            Mark all as read
          </Button>
        )}
      </header>

      {isLoading ? (
        <p className="text-sm text-ink-300">Loading…</p>
      ) : !notifications?.length ? (
        <p className="rounded border border-dashed border-ink-100 px-4 py-10 text-center text-sm text-ink-300">
          Nothing here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <li
              key={notification._id}
              onClick={() => !notification.read && markAsRead.mutate(notification._id)}
              className={clsx(
                "cursor-pointer rounded-lg border px-4 py-3 transition-colors",
                notification.read
                  ? "border-ink-100 bg-white"
                  : "border-brass-light bg-paper-dim"
              )}
            >
              <p className="text-sm text-ink-900">{notification.message}</p>
              <p className="mt-1 text-xs text-ink-300">
                {formatDateTime(notification.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
