import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Bell } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../context/AuthContext";
import { useUnreadCount } from "../features/notifications/useNotifications";

interface NavItem {
  to: string;
  label: string;
}

export const DashboardLayout = ({ navItems }: { navItems: NavItem[] }) => {
  const { user, logout } = useAuth();
  const { data: unreadCount } = useUnreadCount();

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="flex w-60 flex-col border-r border-ink-100 bg-paper-dim px-4 py-6">
        <div className="mb-8 px-2">
          <p className="font-display text-lg font-semibold text-ink-900">Faculty Appointments</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-300">{user?.role}</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "rounded px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-ink-900 text-paper"
                    : "text-ink-700 hover:bg-ink-50"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              clsx(
                "flex items-center justify-between rounded px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-50"
              )
            }
          >
            <span className="flex items-center gap-2">
              <Bell size={15} /> Notifications
            </span>
            {!!unreadCount && unreadCount > 0 && (
              <span className="rounded-full bg-terracotta px-1.5 text-xs font-semibold text-paper">
                {unreadCount}
              </span>
            )}
          </NavLink>
        </nav>

        <div className="mt-auto border-t border-ink-100 pt-4">
          <p className="truncate px-2 text-sm font-medium text-ink-900">{user?.name}</p>
          <p className="truncate px-2 text-xs text-ink-300">{user?.email}</p>
          <button
            onClick={() => logout()}
            className="mt-3 flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-ink-500 hover:bg-ink-50"
          >
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};
