import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as calendarApi from "./calendarApi";
import { getApiErrorMessage } from "../../api/client";

const STATUS_KEY = ["mentor", "calendar-status"];

export const useCalendarStatus = () => {
  return useQuery({ queryKey: STATUS_KEY, queryFn: calendarApi.fetchCalendarStatus });
};

/**
 * Connecting isn't a normal mutation — it's a full-page redirect to
 * Google's consent screen, not an API call this app waits on a response
 * from. The mutation here only covers fetching the URL to redirect to;
 * the actual "connected" state only becomes true after Google redirects
 * back through the backend's /calendar/callback route and the mentor lands
 * back on this dashboard.
 */
export const useConnectCalendar = () => {
  return useMutation({
    mutationFn: calendarApi.getCalendarConnectUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useDisconnectCalendar = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: calendarApi.disconnectCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      toast.success("Google Calendar disconnected");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};
