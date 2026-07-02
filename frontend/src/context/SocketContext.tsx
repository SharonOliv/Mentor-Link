import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { accessToken, user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // No token (logged out) -> tear down any existing connection
    if (!accessToken || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    // Token changed (e.g. after a refresh) -> reconnect with the new one
    // rather than assuming the original connection's auth stays valid
    // forever. The backend's access tokens are short-lived by design (see
    // backend docs/06-phase5), so this reconnect-on-token-change is a real
    // requirement, not defensive padding.
    socketRef.current?.disconnect();

    const socket = io(BACKEND_URL, {
      auth: { token: accessToken },
      withCredentials: true,
    });

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", () => setIsConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [accessToken, user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextValue => useContext(SocketContext);
