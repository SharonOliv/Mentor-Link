import { CalendarCheck, CalendarOff } from "lucide-react";
import { useCalendarStatus, useConnectCalendar, useDisconnectCalendar } from "./calendarHooks";
import { Button } from "../../components/Button";

export const CalendarConnectCard = () => {
  const { data: connected, isLoading } = useCalendarStatus();
  const connect = useConnectCalendar();
  const disconnect = useDisconnectCalendar();

  if (isLoading) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-ink-100 bg-white p-4">
      <div className="flex items-center gap-3">
        {connected ? (
          <CalendarCheck size={18} className="text-sage-dark" />
        ) : (
          <CalendarOff size={18} className="text-ink-300" />
        )}
        <div>
          <p className="text-sm font-medium text-ink-900">Google Calendar</p>
          <p className="text-xs text-ink-300">
            {connected
              ? "Approved appointments get a calendar event and Meet link automatically."
              : "Connect to add Meet links to approved appointments automatically."}
          </p>
        </div>
      </div>
      {connected ? (
        <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()}>
          Disconnect
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
        >
          Connect
        </Button>
      )}
    </div>
  );
};
