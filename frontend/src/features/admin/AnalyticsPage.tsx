import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useDashboardSummary } from "./analyticsHooks";
import { StatCard } from "./StatCard";

// Pulled from the design tokens in tailwind.config.js, rather than
// Tailwind class names, since recharts needs literal color values, not
// CSS classes, for its SVG fills.
const BRASS = "#B08D57";
const SAGE = "#7A8B6F";
const TERRACOTTA = "#C1543C";

const formatMinutes = (minutes: number | null): string => {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
};

export const AnalyticsPage = () => {
  const { data, isLoading } = useDashboardSummary();

  if (isLoading) {
    return <p className="text-sm text-ink-300">Loading…</p>;
  }

  if (!data) {
    return (
      <p className="rounded border border-dashed border-ink-100 px-4 py-10 text-center text-sm text-ink-300">
        Nothing to show yet — analytics will populate once there's booking activity.
      </p>
    );
  }

  const { totalUsers, bookingsByDepartment, busiestMentors, responseRate, turnaround } = data;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Analytics</h1>
        <p className="mt-1 text-sm text-ink-500">
          A read on booking activity across the system.
        </p>
      </header>

      <section className="grid grid-cols-4 gap-4">
        <StatCard label="Students" value={String(totalUsers.students)} />
        <StatCard label="Mentors" value={String(totalUsers.mentors)} />
        <StatCard
          label="Approval rate"
          value={`${Math.round(responseRate.approvalRate * 100)}%`}
          sublabel={`${responseRate.totalResponded} responded, ${responseRate.pendingCount} pending`}
        />
        <StatCard
          label="Median response time"
          value={formatMinutes(turnaround.medianMinutes)}
          sublabel={
            turnaround.sampleSize > 0 ? `from ${turnaround.sampleSize} responses` : "no data yet"
          }
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-300">
          Bookings by department
        </h2>
        {!bookingsByDepartment.length ? (
          <p className="rounded border border-dashed border-ink-100 px-4 py-6 text-center text-sm text-ink-300">
            No bookings yet.
          </p>
        ) : (
          <div className="rounded-lg border border-ink-100 bg-white p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bookingsByDepartment} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F7" vertical={false} />
                <XAxis
                  dataKey="department"
                  tick={{ fontSize: 12, fill: "#3D4F7C" }}
                  axisLine={{ stroke: "#D7DEEB" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#3D4F7C" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 6,
                    border: "1px solid #D7DEEB",
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {bookingsByDepartment.map((_, i) => (
                    <Cell key={i} fill={BRASS} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-300">
          Busiest mentors
        </h2>
        {!busiestMentors.length ? (
          <p className="rounded border border-dashed border-ink-100 px-4 py-6 text-center text-sm text-ink-300">
            No bookings yet.
          </p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-ink-100 bg-white text-sm">
            <thead className="bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-300">
              <tr>
                <th className="px-4 py-2">Mentor</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Total bookings</th>
                <th className="px-4 py-2">Approved</th>
                <th className="px-4 py-2">Declined</th>
              </tr>
            </thead>
            <tbody>
              {busiestMentors.map((mentor) => (
                <tr key={mentor.mentorId} className="border-t border-ink-100">
                  <td className="px-4 py-2.5 font-medium text-ink-900">{mentor.mentorName}</td>
                  <td className="px-4 py-2.5 text-ink-500">{mentor.department}</td>
                  <td className="px-4 py-2.5 text-ink-500">{mentor.totalBookings}</td>
                  <td className="px-4 py-2.5" style={{ color: SAGE }}>
                    {mentor.approvedCount}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: TERRACOTTA }}>
                    {mentor.rejectedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-ink-300">
        Department and mentor figures count every booking ever made, including ones later
        declined and reopened — they reflect demand, not just current state.
      </p>
    </div>
  );
};
