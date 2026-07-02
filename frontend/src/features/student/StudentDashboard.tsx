import { useState } from "react";
import { useMentors, useMentorSlots, useMyBookings, useStudentRealtimeUpdates, useBookSlot } from "./hooks";
import { StatusStamp } from "../../components/StatusStamp";
import { Button } from "../../components/Button";
import { formatDateTime } from "../../utils/formatDate";
import { Appointment } from "../../types";
import clsx from "clsx";

const mentorName = (appointment: Appointment): string => {
  if (typeof appointment.mentorId === "object" && appointment.mentorId) {
    return appointment.mentorId.name;
  }
  return "Mentor";
};

export const StudentDashboard = () => {
  useStudentRealtimeUpdates();

  const { data: mentors, isLoading: mentorsLoading } = useMentors();
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const { data: slots, isLoading: slotsLoading } = useMentorSlots(selectedMentorId);
  const { data: bookings } = useMyBookings();
  const bookSlot = useBookSlot();

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Book an appointment</h1>
        <p className="mt-1 text-sm text-ink-500">Pick a mentor, then an open time.</p>
      </header>

      <section className="grid grid-cols-[260px_1fr] gap-6">
        <div className="flex flex-col gap-1">
          {mentorsLoading ? (
            <p className="text-sm text-ink-300">Loading mentors…</p>
          ) : !mentors?.length ? (
            <p className="text-sm text-ink-300">No mentors available.</p>
          ) : (
            mentors.map((mentor) => (
              <button
                key={mentor._id}
                onClick={() => setSelectedMentorId(mentor._id)}
                className={clsx(
                  "rounded px-3 py-2 text-left text-sm transition-colors",
                  selectedMentorId === mentor._id
                    ? "bg-ink-900 text-paper"
                    : "text-ink-700 hover:bg-ink-50"
                )}
              >
                <p className="font-medium">{mentor.name}</p>
                <p
                  className={clsx(
                    "text-xs",
                    selectedMentorId === mentor._id ? "text-ink-100" : "text-ink-300"
                  )}
                >
                  {mentor.department}
                </p>
              </button>
            ))
          )}
        </div>

        <div>
          {!selectedMentorId ? (
            <p className="rounded border border-dashed border-ink-100 px-4 py-10 text-center text-sm text-ink-300">
              Choose a mentor to see their open times.
            </p>
          ) : slotsLoading ? (
            <p className="text-sm text-ink-300">Loading availability…</p>
          ) : !slots?.length ? (
            <p className="rounded border border-dashed border-ink-100 px-4 py-10 text-center text-sm text-ink-300">
              No open slots right now — check back soon.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {slots.map((slot) => (
                <li
                  key={slot._id}
                  className="flex items-center justify-between rounded-lg border border-ink-100 bg-white px-4 py-3"
                >
                  <span className="text-sm text-ink-900">{formatDateTime(slot.scheduledAt)}</span>
                  <Button
                    size="sm"
                    onClick={() => bookSlot.mutate(slot._id)}
                    disabled={bookSlot.isPending}
                  >
                    Book
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-300">
          Your appointments
        </h2>
        {!bookings?.length ? (
          <p className="rounded border border-dashed border-ink-100 px-4 py-6 text-center text-sm text-ink-300">
            You haven't booked anything yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bookings.map((booking) => (
              <li
                key={booking._id}
                className="flex items-center justify-between rounded-lg border border-ink-100 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{mentorName(booking)}</p>
                  <p className="text-xs text-ink-300">{formatDateTime(booking.scheduledAt)}</p>
                  {booking.meetingLink && (
                    <a
                      href={booking.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-brass-dark hover:underline"
                    >
                      Join with Google Meet
                    </a>
                  )}
                </div>
                <StatusStamp status={booking.bookingStatus ?? booking.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
