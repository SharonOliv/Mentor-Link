import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSummary } from "./analyticsApi";

export const useDashboardSummary = () => {
  return useQuery({
    queryKey: ["admin", "analytics-summary"],
    queryFn: fetchDashboardSummary,
    // Analytics doesn't need to be live to the second — refetching every
    // load is enough, and a long staleTime avoids hammering the aggregation
    // pipelines on every tab focus.
    staleTime: 60_000,
  });
};
