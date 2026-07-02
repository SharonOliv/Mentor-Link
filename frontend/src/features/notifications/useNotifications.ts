import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "./api";
import { useSocket } from "../../context/SocketContext";
import { AppNotification } from "../../types";

export const useUnreadCount = () => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: fetchUnreadCount,
  });

  useEffect(() => {
    if (!socket) return;

    // A live notification arriving bumps the unread count immediately,
    // without waiting for the next poll/refetch — this is the actual
    // point of wiring sockets into the notification bell at all.
    const handleNew = () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    socket.on("notification:new", handleNew);
    return () => {
      socket.off("notification:new", handleNew);
    };
  }, [socket, queryClient]);

  return query;
};

export const useNotifications = () => {
  return useQuery<AppNotification[]>({
    queryKey: ["notifications", "list"],
    queryFn: fetchNotifications,
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
};

export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
};
