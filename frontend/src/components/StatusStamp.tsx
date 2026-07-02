import clsx from "clsx";
import { AppointmentStatus, BookingStatus } from "../types";

type Status = AppointmentStatus | BookingStatus;

const config: Record<Status, { label: string; classes: string; rotate: string }> = {
  open: { label: "Open", classes: "border-ink-300 text-ink-500", rotate: "" },
  booked: { label: "Booked", classes: "border-brass text-brass-dark", rotate: "-rotate-2" },
  completed: { label: "Completed", classes: "border-sage text-sage-dark", rotate: "rotate-1" },
  cancelled: { label: "Cancelled", classes: "border-ink-300 text-ink-300", rotate: "rotate-2" },
  pending: { label: "Pending", classes: "border-terracotta text-terracotta-dark", rotate: "-rotate-1" },
  approved: { label: "Approved", classes: "border-sage text-sage-dark", rotate: "-rotate-2" },
  rejected: { label: "Declined", classes: "border-terracotta text-terracotta-dark", rotate: "rotate-2" },
  rescheduled: { label: "Rescheduled", classes: "border-brass text-brass-dark", rotate: "rotate-1" },
};

/**
 * The signature element for this design (see frontend design plan): an
 * appointment's status reads like a stamp on a ledger page rather than a
 * generic colored pill — a slight rotation, a double border, monospace
 * uppercase type. It's the one place this app takes a visual risk; every
 * other surface stays quiet and disciplined around it.
 */
export const StatusStamp = ({ status }: { status: Status }) => {
  const { label, classes, rotate } = config[status];

  return (
    <span
      className={clsx(
        "inline-block select-none rounded-sm border-2 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider",
        classes,
        rotate
      )}
    >
      {label}
    </span>
  );
};
