import { api } from "../../api/client";

export interface DashboardSummary {
  totalUsers: { students: number; mentors: number; admins: number };
  bookingsByDepartment: { department: string; count: number }[];
  busiestMentors: {
    mentorId: string;
    mentorName: string;
    department: string;
    totalBookings: number;
    approvedCount: number;
    rejectedCount: number;
  }[];
  responseRate: {
    totalResponded: number;
    approvedCount: number;
    rejectedCount: number;
    approvalRate: number;
    pendingCount: number;
  };
  turnaround: {
    averageMinutes: number | null;
    medianMinutes: number | null;
    sampleSize: number;
  };
}

export const fetchDashboardSummary = async (): Promise<DashboardSummary> => {
  const { data } = await api.get<{ data: DashboardSummary }>("/analytics/summary");
  return data.data;
};
