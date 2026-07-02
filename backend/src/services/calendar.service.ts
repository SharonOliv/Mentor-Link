import { google } from "googleapis";
import { env, isGoogleCalendarConfigured } from "../config/env";
import { User } from "../models/User";
import { AppError } from "../utils/AppError";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

// Deriving the type directly from googleapis's own constructor, rather
// than importing OAuth2Client from the standalone google-auth-library
// package, avoids a real type mismatch: googleapis bundles its own
// internal copy of that library, and TypeScript treats the two OAuth2Client
// types as structurally incompatible even though they're the same shape at
// runtime. This is the type-safe way to reference "whatever googleapis
// itself returns" without that conflict.
type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

const createOAuthClient = (): GoogleOAuthClient => {
  return new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );
};

/**
 * Step 1 of the connect flow: build the URL the mentor is redirected to.
 * `state` carries the mentor's user ID through Google's redirect so the
 * callback knows whose account to attach the tokens to — Google's OAuth
 * flow has no other way to identify the user on the way back.
 */
export const getGoogleAuthUrl = (mentorId: string): string => {
  if (!isGoogleCalendarConfigured()) {
    throw new AppError("Google Calendar integration is not configured on this server.", 503);
  }

  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh token, not just an access token
    scope: SCOPES,
    prompt: "consent", // forces a refresh token on every connect, not just the first time
    state: mentorId,
  });
};

/**
 * Step 2: Google redirects back to our callback route with a one-time
 * code. Exchange it for an access token + refresh token and store both on
 * the mentor's User document.
 */
export const handleGoogleCallback = async (code: string, mentorId: string): Promise<void> => {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    // Google only sends a refresh token on the *first* consent, or when
    // prompt=consent forces re-consent (which getGoogleAuthUrl always
    // does) — if it's still missing here, something about the OAuth app
    // config is wrong, not the user's fault.
    throw new AppError(
      "Google did not return a refresh token. Try disconnecting and reconnecting.",
      502
    );
  }

  await User.findByIdAndUpdate(mentorId, {
    googleCalendarTokens: {
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? 0,
    },
  });
};

export const disconnectGoogleCalendar = async (mentorId: string): Promise<void> => {
  await User.findByIdAndUpdate(mentorId, { $unset: { googleCalendarTokens: 1 } });
};

export const isCalendarConnected = async (mentorId: string): Promise<boolean> => {
  const user = await User.findById(mentorId).select("+googleCalendarTokens");
  return !!user?.googleCalendarTokens?.refreshToken;
};

interface CreatedEvent {
  eventId: string;
  meetingLink: string;
}

/**
 * Creates a calendar event with a Google Meet link for an approved
 * appointment. Returns null (not a throw) if the mentor hasn't connected
 * their calendar — calendar sync is an enhancement, not a requirement, and
 * the booking approval that calls this must succeed either way. See the
 * call site in appointment.service.ts for how that failure boundary works.
 */
export const createCalendarEvent = async (
  mentorId: string,
  studentEmail: string,
  studentName: string,
  scheduledAt: Date,
  durationMinutes: number
): Promise<CreatedEvent | null> => {
  const user = await User.findById(mentorId).select("+googleCalendarTokens");
  const tokens = user?.googleCalendarTokens;

  if (!tokens?.refreshToken) {
    return null;
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
  });

  // The client library handles refreshing an expired access token
  // automatically using the refresh token, and fires this listener with
  // the new credentials — persist them so the next call doesn't have to
  // refresh again unnecessarily.
  client.on("tokens", (newTokens) => {
    const update: Record<string, unknown> = {};
    if (newTokens.access_token) update["googleCalendarTokens.accessToken"] = newTokens.access_token;
    if (newTokens.expiry_date) update["googleCalendarTokens.expiryDate"] = newTokens.expiry_date;
    if (Object.keys(update).length > 0) {
      User.findByIdAndUpdate(mentorId, update).catch((err) =>
        console.error("[calendar] failed to persist refreshed token:", err)
      );
    }
  });

  const calendar = google.calendar({ version: "v3", auth: client });
  const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Appointment with ${studentName}`,
      start: { dateTime: scheduledAt.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees: [{ email: studentEmail }],
      conferenceData: {
        createRequest: {
          requestId: `${mentorId}-${scheduledAt.getTime()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetingLink = response.data.hangoutLink ?? response.data.htmlLink ?? "";
  const eventId = response.data.id ?? "";

  return { eventId, meetingLink };
};
