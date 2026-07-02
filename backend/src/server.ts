import express, { Application } from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { connectToDatabase } from "./config/db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import mentorRoutes from "./routes/mentor.routes";
import studentRoutes from "./routes/student.routes";
import notificationRoutes from "./routes/notification.routes";
import calendarRoutes from "./routes/calendar.routes";
import analyticsRoutes from "./routes/analytics.routes";
import { initSocketServer } from "./sockets";

const app: Application = express();

// Security headers
app.use(helmet());

// CORS - locked to the configured frontend origin, not wide open like a bare cors()
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true, // required so the httpOnly refresh-token cookie is sent
  })
);

app.use(express.json());
app.use(cookieParser());

// Basic rate limiting - applied globally here; auth routes get a stricter limit in Phase 3
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Faculty Appointment API" });
});

// Feature routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/mentor", mentorRoutes);
app.use("/api/v1/student", studentRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/calendar", calendarRoutes);
app.use("/api/v1/analytics", analyticsRoutes);

// Remaining feature routes are mounted here in later phases

app.use(notFoundHandler);
app.use(errorHandler);

// Express and Socket.IO share the same underlying HTTP server and port —
// this is also why this app needs a long-running host (Render/Railway, not
// Vercel serverless functions); see the deployment note in the roadmap doc.
const httpServer = createServer(app);
initSocketServer(httpServer);

const start = async (): Promise<void> => {
  await connectToDatabase();
  httpServer.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port}`);
    console.log(`[socket.io] real-time layer attached`);
  });
};

start();
