import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import toast from "react-hot-toast";
import * as mentorApi from "./api";
import { useSocket } from "../../context/SocketContext";
import { getApiErrorMessage } from "../../api/client";

const SLOTS_KEY = ["mentor", "slots"];
const PENDING_KEY = ["mentor", "bookings", "pending"];

export const useMySlots = () => {
  return useQuery({ queryKey: SLOTS_KEY, queryFn: mentorApi.fetchMySlots });
};

export const usePendingBookings = () => {
  return useQuery({ queryKey: PENDING_KEY, queryFn: mentorApi.fetchPendingBookings });
};

/**
 * Subscribes to the real-time events from the backend's appointment event
 * listeners (see backend docs/06-phase5) and invalidates the relevant
 * queries so the UI updates without the mentor needing to refresh. This is
 * the actual point of the whole Socket.IO layer from the mentor's side —
 * a booking request shows up the moment it happens.
 */
export const useMentorRealtimeUpdates = () => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const onBookingRequested = () => {
      queryClient.invalidateQueries({ queryKey: PENDING_KEY });
      toast("New appointment request received", { icon: "📩" });
    };
    const onSlotCreated = () => queryClient.invalidateQueries({ queryKey: SLOTS_KEY });
    const onSlotDeleted = () => queryClient.invalidateQueries({ queryKey: SLOTS_KEY });

    socket.on("booking:requested", onBookingRequested);
    socket.on("slot:created", onSlotCreated);
    socket.on("slot:deleted", onSlotDeleted);

    return () => {
      socket.off("booking:requested", onBookingRequested);
      socket.off("slot:created", onSlotCreated);
      socket.off("slot:deleted", onSlotDeleted);
    };
  }, [socket, queryClient]);
};

export const useCreateSlot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduledAt, durationMinutes }: { scheduledAt: string; durationMinutes?: number }) =>
      mentorApi.createSlot(scheduledAt, durationMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLOTS_KEY });
      toast.success("Slot created");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useDeleteSlot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mentorApi.deleteSlot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLOTS_KEY });
      toast.success("Slot deleted");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useApproveBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mentorApi.approveBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_KEY });
      queryClient.invalidateQueries({ queryKey: SLOTS_KEY });
      toast.success("Appointment approved");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useRejectBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mentorApi.rejectBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_KEY });
      queryClient.invalidateQueries({ queryKey: SLOTS_KEY });
      toast.success("Appointment declined — slot reopened");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};
