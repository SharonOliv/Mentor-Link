# Phase 7 — Google Calendar Integration

Mentors connect their Google Calendar once; every appointment a mentor approves afterward gets a calendar event with a Google Meet link, generated automatically, on both the backend and frontend.

---

## How the OAuth flow actually works

This is a standard OAuth2 "authorization code" flow, but worth walking through since it spans three separate hops:

1. **Mentor clicks "Connect" on the dashboard.** The frontend calls `GET /api/v1/calendar/connect`, which returns a Google consent-screen URL built by `getGoogleAuthUrl()`. The frontend redirects the whole page there — this isn't an API call the frontend waits on, it's a real navigation away from the app.
2. **Mentor approves access on Google's own page.** This happens entirely outside our app; we have no visibility into it until Google redirects back.
3. **Google redirects to our backend's callback URL** (`GET /api/v1/calendar/callback`) with a one-time authorization `code` and the `state` value we originally sent (the mentor's user ID). The backend exchanges that code for an access token and refresh token, stores both on the mentor's `User` document, and redirects the browser back into the frontend app with a `?calendar=connected` query param.
4. **The frontend dashboard reads that param**, shows a toast, and strips it from the URL.

The reason `state` exists at all: Google's redirect back to our callback is a plain browser GET request with no `Authorization` header — there's no other way for that route to know *which* mentor just went through the consent flow. Carrying the user ID through `state` is the standard way OAuth2 handles this.

```
Mentor clicks Connect
        │
        ▼
GET /calendar/connect ──► returns Google's consent URL (state=mentorId)
        │
        ▼
Browser navigates to accounts.google.com (outside our app)
        │
        ▼
Google redirects to GET /calendar/callback?code=...&state=mentorId
        │
        ▼
Backend exchanges code for tokens, stores on User, redirects to
        frontend /mentor/dashboard?calendar=connected
```

---

## Why the callback route isn't behind `protect`

Every other mentor-only route in this app requires a bearer token via `protect, restrictTo("mentor")`. The callback route deliberately doesn't:

```typescript
// NOT behind protect — Google's redirect carries no Authorization header
router.get("/callback", calendarController.handleCallback);

router.use(protect, restrictTo("mentor"));
router.get("/connect", calendarController.getConnectUrl);
```

This isn't an oversight — it's the correct shape for an OAuth callback. The mentor's identity for this one request comes from the `state` parameter Google round-trips back, which was set by *our* `/connect` endpoint (which *is* authenticated) in the first place. Nothing about this lets an unauthenticated caller do anything useful: hitting `/callback` directly with a fabricated `code` just fails at Google's token-exchange step, since that `code` was never actually issued by Google.

---

## Why this is wrapped in its own failure boundary

Calendar event creation happens inside `approveBooking`, but it cannot be allowed to make booking approval itself fail:

```typescript
// the booking approval (the part that matters most) has already succeeded above
if (student && mentor) {
  try {
    const event = await createCalendarEvent(...);
    if (event) {
      appointment.meetingLink = event.meetingLink;
      appointment.calendarEventId = event.eventId;
      await appointment.save();
    }
  } catch (err) {
    console.error("[calendar] failed to create event for approved booking:", err);
  }
}
```

If a mentor's Google refresh token has been revoked, or Google's API has a brief outage, or anything else goes wrong here, the mentor's approval of the booking has *already happened* — the database write a few lines above this already completed. A calendar sync failure should never look like "my approval didn't work" to the mentor; it should look like "the approval worked, the calendar link just didn't get attached this time." The `try/catch` here is what enforces that distinction. `createCalendarEvent` itself also returns `null` (not a throw) for the simpler, expected case of a mentor who simply hasn't connected their calendar at all — that's not an error condition, it's the default state for most mentors most of the time.

---

## Why `prompt: "consent"` is always set

```typescript
return client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // forces a refresh token on every connect, not just the first time
  state: mentorId,
});
```

Google only issues a refresh token the *first* time a user consents to a given app+scope combination — if they'd connected before, disconnected, and reconnect, a normal consent flow would hand back an access token with no refresh token at all, since "first consent" already happened in Google's records. `prompt: "consent"` forces the consent screen (and therefore a fresh refresh token) every time, which matters here because a mentor disconnecting and reconnecting needs a working refresh token, not a access-token-only connection that silently stops working in an hour.

---

## A real type conflict worth knowing about, in case you hit it elsewhere

While building this, type-checking surfaced a genuine conflict: `googleapis` bundles its *own* internal copy of the `google-auth-library` package, and that internal copy is structurally incompatible (per TypeScript, even though identical at runtime) with the standalone `google-auth-library` package if you import `OAuth2Client`'s type from it directly. The fix used here avoids importing that type at all — instead, the client's type is derived directly from `googleapis`'s own constructor:

```typescript
type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;
```

This is a "derive the type from the value you actually have" pattern rather than "import the type from where you'd expect it to live" — worth remembering if you ever add another Google API client library to this project and hit a similar duplicate-package type error.

---

## Files added/changed in this phase

**Backend:**
```
backend/src/
├── services/calendar.service.ts     # OAuth URL generation, token exchange, event creation
├── controllers/calendar.controller.ts
└── routes/calendar.routes.ts
```
Modified: `config/env.ts` (added optional Google config + `isGoogleCalendarConfigured()`), `services/appointment.service.ts` (calendar event creation wired into `approveBooking`).

**Frontend:**
```
frontend/src/features/mentor/
├── calendarApi.ts
├── calendarHooks.ts
└── CalendarConnectCard.tsx
```
Modified: `MentorDashboard.tsx` (renders the connect card, handles the `?calendar=` redirect param), `StudentDashboard.tsx` (shows the Meet link on approved bookings).

---

## Setup

In the [Google Cloud Console](https://console.cloud.google.com/), create OAuth 2.0 credentials (Web application type), enable the Google Calendar API for the project, and add an authorized redirect URI matching exactly what you'll set as `GOOGLE_REDIRECT_URI` — for local development, `http://localhost:5000/api/v1/calendar/callback`.

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/calendar/callback
```

If these are left blank, the feature is simply unavailable — `getGoogleAuthUrl` throws a clean 503 ("not configured on this server") rather than the app failing to boot. This was a deliberate choice (see `config/env.ts`): connecting a calendar is a per-mentor opt-in, not something the whole server should refuse to start over.

---

## What was actually tested vs. reviewed-but-unverified

**Verified by actually running (not just reading):** the most important pure-logic pieces here were compiled and executed directly:
- `isGoogleCalendarConfigured()` correctly returns `false` when the Google env vars are unset (the default).
- `getGoogleAuthUrl()` correctly throws an `AppError` with status code 503 when not configured — confirmed both the error type and the exact status code, not just "it threw something."
- With fake-but-well-formed credentials, `getGoogleAuthUrl()` produces a URL that actually points to `accounts.google.com`, correctly carries the mentor's ID via `state`, requests `access_type=offline` (required for a refresh token), requests the calendar scope, and forces `prompt=consent` — every parameter that matters for this flow to work was individually checked, not assumed.
- Both backend (`npx tsc --noEmit`) and frontend (`npx tsc -b --noEmit` and a full `npm run build`) compile cleanly with this phase's additions.
- Re-ran the headless-browser check from Phase 6 against the updated frontend: navigating directly to `/mentor/dashboard` while logged out still correctly redirects to `/login` with zero uncaught exceptions, confirming the new calendar UI didn't break the existing route guard.

**Reviewed carefully, not run end-to-end (the same honest gap as every phase touching a live external service):** the actual token exchange (`handleGoogleCallback`), the live `calendar.events.insert` call, and the full consent-screen round trip all require real Google OAuth credentials and a live network path to Google's APIs, which this sandbox doesn't have configured. The code follows `googleapis`'s documented patterns closely, and the logic around it (the failure boundary in `approveBooking`, the optional-by-default config) was reasoned through carefully — but you should connect a real mentor account and approve a real booking to confirm a Meet link actually shows up before relying on this in front of real users.

A good first manual test once you have real Google credentials configured: connect the seeded mentor account, have the seeded student book a slot, approve it as the mentor, and confirm the appointment in the student's "Your appointments" list shows a working "Join with Google Meet" link.

---

**Next:** the admin analytics dashboard, and deployment (Vercel for the frontend, Render/Railway for the backend, MongoDB Atlas for the database) remain on the original roadmap. Say which, or "go" for analytics.
