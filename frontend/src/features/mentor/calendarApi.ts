import { api } from "../../api/client";

export const fetchCalendarStatus = async (): Promise<boolean> => {
  const { data } = await api.get<{ data: { connected: boolean } }>("/calendar/status");
  return data.data.connected;
};

export const getCalendarConnectUrl = async (): Promise<string> => {
  const { data } = await api.get<{ data: { url: string } }>("/calendar/connect");
  return data.data.url;
};

export const disconnectCalendar = async (): Promise<void> => {
  await api.delete("/calendar/disconnect");
};
