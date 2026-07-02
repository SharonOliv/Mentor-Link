import { Appointment } from "../models/Appointment";
import { BookingEvent } from "../models/BookingEvent";
import { User } from "../models/User";

interface DepartmentBookingCount {
  department: string;
  count: number;
}

/**
 * Bookings per department. Appointment documents only carry `mentorId`, not
 * department directly, so this needs a $lookup against `users` to resolve
 * the mentor's department before grouping. Counts every booking event ever
 * logged (not just currently-open-slot state), since a department's actual
 * booking volume includes bookings that were later rejected and the slot
 * reopened — that history still happened and still represents real demand.
 */
export const bookingsByDepartment = async (): Promise<DepartmentBookingCount[]> => {
  const results = await BookingEvent.aggregate([
    { $match: { eventType: "booked" } },
    {
      $lookup: {
        from: "users",
        localField: "mentorId",
        foreignField: "_id",
        as: "mentor",
      },
    },
    { $unwind: "$mentor" },
    { $group: { _id: "$mentor.department", count: { $sum: 1 } } },
    { $project: { _id: 0, department: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);

  return results;
};

interface MentorLoad {
  mentorId: string;
  mentorName: string;
  department: string;
  totalBookings: number;
  approvedCount: number;
  rejectedCount: number;
}

/**
 * Busiest mentors by total booking volume, with their approve/reject split
 * alongside it — "busiest" on its own doesn't tell an admin much; busiest
 * *and* what happens to those bookings does.
 */
export const busiestMentors = async (limit = 10): Promise<MentorLoad[]> => {
  const results = await BookingEvent.aggregate([
    {
      $group: {
        _id: "$mentorId",
        totalBookings: {
          $sum: { $cond: [{ $eq: ["$eventType", "booked"] }, 1, 0] },
        },
        approvedCount: {
          $sum: { $cond: [{ $eq: ["$eventType", "approved"] }, 1, 0] },
        },
        rejectedCount: {
          $sum: { $cond: [{ $eq: ["$eventType", "rejected"] }, 1, 0] },
        },
      },
    },
    { $sort: { totalBookings: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "mentor",
      },
    },
    { $unwind: "$mentor" },
    {
      $project: {
        _id: 0,
        mentorId: { $toString: "$_id" },
        mentorName: "$mentor.name",
        department: "$mentor.department",
        totalBookings: 1,
        approvedCount: 1,
        rejectedCount: 1,
      },
    },
  ]);

  return results;
};

interface ResponseRateSummary {
  totalResponded: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRate: number; // 0-1
  pendingCount: number;
}

/**
 * Approval vs rejection rate across the whole system. `pendingCount` comes
 * from the live Appointment collection (current state), while approved/
 * rejected counts come from BookingEvent (durable history) — mixing the two
 * sources is intentional: "how many are pending right now" is a live-state
 * question, "how many were ever approved vs rejected" is a history
 * question, and conflating them would either undercount history or treat
 * "pending" as a thing that has a count in a log of completed events.
 */
export const responseRateSummary = async (): Promise<ResponseRateSummary> => {
  const [eventCounts, pendingCount] = await Promise.all([
    BookingEvent.aggregate([
      { $match: { eventType: { $in: ["approved", "rejected"] } } },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]),
    Appointment.countDocuments({ status: "booked", bookingStatus: "pending" }),
  ]);

  const approvedCount = eventCounts.find((e) => e._id === "approved")?.count ?? 0;
  const rejectedCount = eventCounts.find((e) => e._id === "rejected")?.count ?? 0;
  const totalResponded = approvedCount + rejectedCount;

  return {
    totalResponded,
    approvedCount,
    rejectedCount,
    approvalRate: totalResponded > 0 ? approvedCount / totalResponded : 0,
    pendingCount,
  };
};

interface TurnaroundStats {
  averageMinutes: number | null;
  medianMinutes: number | null;
  sampleSize: number;
}

/**
 * How long mentors take to respond to a booking request, measured from
 * `bookedAt` to `respondedAt` on BookingEvent records that have both. This
 * is the metric that specifically needed the new bookedAt/respondedAt
 * fields — using the Appointment model's generic updatedAt here would have
 * silently mixed in unrelated updates (calendar link attachment, etc.) and
 * produced a misleading number.
 */
export const approvalTurnaroundStats = async (): Promise<TurnaroundStats> => {
  const events = await BookingEvent.aggregate([
    {
      $match: {
        eventType: { $in: ["approved", "rejected"] },
        bookedAt: { $ne: null },
        respondedAt: { $ne: null },
      },
    },
    {
      $project: {
        minutesToRespond: {
          $divide: [{ $subtract: ["$respondedAt", "$bookedAt"] }, 60000],
        },
      },
    },
  ]);

  if (events.length === 0) {
    return { averageMinutes: null, medianMinutes: null, sampleSize: 0 };
  }

  const minutes = events.map((e) => e.minutesToRespond as number).sort((a, b) => a - b);
  const average = minutes.reduce((sum, m) => sum + m, 0) / minutes.length;
  const mid = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2 === 0 ? (minutes[mid - 1] + minutes[mid]) / 2 : minutes[mid];

  return {
    averageMinutes: Math.round(average),
    medianMinutes: Math.round(median),
    sampleSize: minutes.length,
  };
};

export interface DashboardSummary {
  totalUsers: { students: number; mentors: number; admins: number };
  bookingsByDepartment: DepartmentBookingCount[];
  busiestMentors: MentorLoad[];
  responseRate: ResponseRateSummary;
  turnaround: TurnaroundStats;
}

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const [userCounts, departments, mentors, responseRate, turnaround] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    bookingsByDepartment(),
    busiestMentors(5),
    responseRateSummary(),
    approvalTurnaroundStats(),
  ]);

  const countFor = (role: string) =>
    (userCounts as { _id: string; count: number }[]).find((u) => u._id === role)?.count ?? 0;

  return {
    totalUsers: {
      students: countFor("student"),
      mentors: countFor("mentor"),
      admins: countFor("admin"),
    },
    bookingsByDepartment: departments,
    busiestMentors: mentors,
    responseRate,
    turnaround,
  };
};
