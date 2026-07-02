import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  dbUrl: required("DB_URL"),

  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  mail: {
    host: process.env.MAIL_HOST || "",
    port: Number(process.env.MAIL_PORT) || 587,
    user: process.env.MAIL_USER || "",
    pass: process.env.MAIL_PASS || "",
  },

  // Deliberately optional, not required() — connecting Google Calendar is a
  // per-mentor opt-in feature, not core to the app booting. If these are
  // unset, the calendar service simply reports "not configured" rather
  // than crashing the whole server on startup.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },

  isProduction: process.env.NODE_ENV === "production",
};

export const isGoogleCalendarConfigured = (): boolean =>
  !!(env.google.clientId && env.google.clientSecret && env.google.redirectUri);
