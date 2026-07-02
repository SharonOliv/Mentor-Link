import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/token";
import { env } from "../config/env";
import { domainEvents } from "./domainEvents";
import { registerAppointmentEventListeners } from "./appointmentEvents";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | null = null;

export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * Initializes Socket.IO on top of the existing HTTP server (the same one
 * Express listens on — Socket.IO and Express share a port, which is exactly
 * why this needs a long-running process and can't live on Vercel's
 * serverless functions; see the deployment note in the roadmap doc).
 */
export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
    },
  });

  // Auth middleware: every connecting socket must present a valid access
  // token, the same one used for REST requests. No anonymous sockets.
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    if (!socket.userId) {
      socket.disconnect();
      return;
    }

    // Room-per-user: every device/tab this user has open joins the same
    // room, so emitting once to `user:<id>` reaches all of them.
    socket.join(userRoom(socket.userId));

    socket.on("disconnect", () => {
      // socket.io handles room cleanup automatically on disconnect
    });
  });

  registerAppointmentEventListeners(io);

  return io;
};

export const getSocketServer = (): SocketIOServer => {
  if (!io) {
    throw new Error("Socket.IO server has not been initialized yet");
  }
  return io;
};

export { domainEvents };
