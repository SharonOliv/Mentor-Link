import { useState } from "react";
import { Ban, CheckCircle2, Trash2 } from "lucide-react";
import { useUsers, useSetUserStatus, useDeleteUser } from "./hooks";
import { CreateUserForm } from "./CreateUserForm";
import { BulkImportForm } from "./BulkImportForm";
import clsx from "clsx";

export const AdminDashboard = () => {
  const [roleFilter, setRoleFilter] = useState<string>("");
  const { data: users, isLoading } = useUsers(roleFilter ? { role: roleFilter } : undefined);
  const setStatus = useSetUserStatus();
  const deleteUser = useDeleteUser();

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Accounts</h1>
        <p className="mt-1 text-sm text-ink-500">
          Create and manage every account in the system. There is no self-registration.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <CreateUserForm />
        <BulkImportForm />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-300">
            All accounts
          </h2>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded border border-ink-100 px-2 py-1 text-sm focus:border-brass focus:outline-none"
          >
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="mentor">Mentors</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-300">Loading…</p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-ink-100 bg-white text-sm">
            <thead className="bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-300">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users?.map((user) => (
                <tr key={user._id} className="border-t border-ink-100">
                  <td className="px-4 py-2.5 font-medium text-ink-900">{user.name}</td>
                  <td className="px-4 py-2.5 text-ink-500">{user.email}</td>
                  <td className="px-4 py-2.5 capitalize text-ink-500">{user.role}</td>
                  <td className="px-4 py-2.5 text-ink-500">{user.department ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={clsx(
                        "text-xs font-medium",
                        user.status === "active" ? "text-sage-dark" : "text-terracotta-dark"
                      )}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() =>
                          setStatus.mutate({
                            id: user._id,
                            status: user.status === "active" ? "disabled" : "active",
                          })
                        }
                        className="text-ink-300 hover:text-brass-dark"
                        aria-label={user.status === "active" ? "Disable" : "Enable"}
                        title={user.status === "active" ? "Disable account" : "Enable account"}
                      >
                        {user.status === "active" ? (
                          <Ban size={15} />
                        ) : (
                          <CheckCircle2 size={15} />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${user.name}? This also deletes their appointments and messages.`)) {
                            deleteUser.mutate(user._id);
                          }
                        }}
                        className="text-ink-300 hover:text-terracotta"
                        aria-label="Delete"
                        title="Delete account"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
