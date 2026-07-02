import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Trash2, Check, X } from "lucide-react";
import {
  useMySlots,
  usePendingBookings,
  useMentorRealtimeUpdates,
  useCreateSlot,
  useDeleteSlot,
  useApproveBooking,
  useRejectBooking,
} from "./hooks";
import { CalendarConnectCard } from "./CalendarConnectCard";
import { StatusStamp } from "../../components/StatusStamp";
import { Button } from "../../components/Button";
import { formatDateTime, toDateTimeInputValue } from "../../utils/formatDate";
import { Appointment } from "../../types";

const studentName = (appointment: Appointment): string => {
  if (typeof appointment.bookedBy === "object" && appointment.bookedBy) {
    return appointment.bookedBy.name;
  }
  return "Student";
};

export const MentorDashboard = () => {
  useMentorRealtimeUpdates();

  const [searchParams, setSearchParams] = useSearchParams();

  // After Google redirects back through the backend's /calendar/callback,
  // the backend redirects the browser here with a query param indicating
  // the outcome. This is a one-time toast on landing, not persisted state —
  // the actual connected/disconnected state is read fresh from
  // /calendar/status by CalendarConnectCard regardless of this param.
  useEffect(() => {
    const calendarResult = searchParams.get("calendar");
    if (calendarResult === "connected") {
      toast.success("Google Calendar connected");
    } else if (calendarResult === "denied") {
      toast.error("Google Calendar connection was cancelled");
    }
    if (calendarResult) {
      searchParams.delete("calendar");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: slots, isLoading: slotsLoading } = useMySlots();
  const { data: pending, isLoading: pendingLoading } = usePendingBookings();
  const createSlot = useCreateSlot();
  const deleteSlot = useDeleteSlot();
  const approve = useApproveBooking();
  const reject = useRejectBooking();

  const [newSlotTime, setNewSlotTime] = useState(
    toDateTimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000))
  );

  const handleCreateSlot = (e: FormEvent) => {
    e.preventDefault();
    createSlot.mutate({ scheduledAt: new Date(newSlotTime).toISOString() });
  };

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Office hours</h1>
        <p className="mt-1 text-sm text-ink-500">
          Open new slots and review requests from students.
        </p>
      </header>

      <CalendarConnectCard />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-300">
          Pending requests
        </h2>
        {pendingLoading ? (
          <p className="text-sm text-ink-300">Loading…</p>
        ) : !pending?.length ? (
          <p className="rounded border border-dashed border-ink-100 px-4 py-6 text-center text-sm text-ink-300">
            No pending requests right now.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((appointment) => (
              <li
                key={appointment._id}
                className="flex items-center justify-between rounded-lg border border-ink-100 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    {studentName(appointment)}
                  </p>
                  <p className="text-xs text-ink-300">{formatDateTime(appointment.scheduledAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusStamp status="pending" />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => approve.mutate(appointment._id)}
                    disabled={approve.isPending}
                    aria-label="Approve"
                  >
                    <Check size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => reject.mutate(appointment._id)}
                    disabled={reject.isPending}
                    aria-label="Decline"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-300">
          Open a new slot
        </h2>
        <form
          onSubmit={handleCreateSlot}
          className="flex items-end gap-3 rounded-lg border border-ink-100 bg-white p-4"
        >
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-700">Date &amp; time</span>
            <input
              type="datetime-local"
              required
              value={newSlotTime}
              onChange={(e) => setNewSlotTime(e.target.value)}
              className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
            />
          </label>
          <Button type="submit" disabled={createSlot.isPending}>
            <span className="flex items-center gap-1.5">
              <Plus size={15} /> Add slot
            </span>
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-300">
          Your schedule
        </h2>
        {slotsLoading ? (
          <p className="text-sm text-ink-300">Loading…</p>
        ) : !slots?.length ? (
          <p className="rounded border border-dashed border-ink-100 px-4 py-6 text-center text-sm text-ink-300">
            No slots yet — add one above.
          </p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-ink-100 bg-white text-sm">
            <thead className="bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-300">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">With</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot._id} className="border-t border-ink-100">
                  <td className="px-4 py-2.5">{formatDateTime(slot.scheduledAt)}</td>
                  <td className="px-4 py-2.5">
                    <StatusStamp status={slot.bookingStatus ?? slot.status} />
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">
                    {slot.bookedBy ? (
                      <>
                        {studentName(slot)}
                        {slot.meetingLink && (
                          <a
                            href={slot.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-xs font-medium text-brass-dark hover:underline"
                          >
                            Meet link
                          </a>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {slot.status === "open" && (
                      <button
                        onClick={() => deleteSlot.mutate(slot._id)}
                        className="text-ink-300 hover:text-terracotta"
                        aria-label="Delete slot"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
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
