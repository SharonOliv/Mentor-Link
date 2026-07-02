import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import toast from "react-hot-toast";
import * as studentApi from "./api";
import { useSocket } from "../../context/SocketContext";
import { getApiErrorMessage } from "../../api/client";

const BOOKINGS_KEY = ["student", "bookings"];

export const useMentors = (department?: string) => {
  return useQuery({
    queryKey: ["student", "mentors", department ?? "all"],
    queryFn: () => studentApi.fetchMentors(department),
  });
};

export const useMentorSlots = (mentorId: string | null) => {
  return useQuery({
    queryKey: ["student", "mentor-slots", mentorId],
    queryFn: () => studentApi.fetchMentorSlots(mentorId!),
    enabled: !!mentorId,
  });
};

export const useMyBookings = () => {
  return useQuery({ queryKey: BOOKINGS_KEY, queryFn: studentApi.fetchMyBookings });
};

/**
 * A student needs to know the moment their booking is approved or
 * declined, since the original flow required refreshing the page (or
 * worse, checking email) to find out. This invalidates the bookings list
 * on either event so the status badge updates live.
 */
export const useStudentRealtimeUpdates = () => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const onApproved = () => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success("An appointment was approved");
    };
    const onRejected = () => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast("An appointment request was declined", { icon: "ℹ️" });
    };

    socket.on("booking:approved", onApproved);
    socket.on("booking:rejected", onRejected);

    return () => {
      socket.off("booking:approved", onApproved);
      socket.off("booking:rejected", onRejected);
    };
  }, [socket, queryClient]);
};

export const useBookSlot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: studentApi.bookSlot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
      queryClient.invalidateQueries({ queryKey: ["student", "mentor-slots"] });
      toast.success("Appointment requested");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};
