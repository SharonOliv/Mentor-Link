# Phase 3 — Auth & RBAC Rebuild

This is the core pivot you asked for: no self-registration, one role-aware login, admin creates every account (including CSV bulk import), and short-lived access tokens with a refresh flow.

---

## Real problems found in the current auth code

Re-reading `authController.js`, `adminController.js`, and the route files before building this, a few things stood out that are worth knowing about, not just fixing silently:

**1. Two separate login endpoints already exist** — `POST /student/login` and `POST /teacher/login`, both routed to the exact same `login` controller function. They've always done the same thing; the separation was never functionally necessary, just structurally implied by having separate route files per role. The new structure has one `/api/v1/auth/login` and nothing else needs to change about *how* login works, since the controller already didn't care which "door" you came through — that part of your instinct that this needed unifying was right, it just hadn't been done yet.

**2. `admin/:id` routes have no auth middleware at all.** Looking at `adminRoutes.js`:
```js
router.route('/:id').get(getTeacher).patch(updateTeacher).delete(deleteTeacher);
```
No `verifyToken`, no `allow('admin')`. Anyone who knows or guesses a user's MongoDB `_id` can fetch, edit, or delete that account with zero authentication. This is a real, exploitable gap in the current deployed code, not a hypothetical. Fixed here by gating the entire admin router behind `protect, restrictTo('admin')` at the router level — one line that covers every route in the file, rather than remembering to add it to each route individually (which is exactly how the original gap happened).

**3. Tokens never meaningfully expire.** The current JWT is signed with a 90-day expiry and there's no refresh mechanism — a stolen token is valid for three months. Replaced with a 15-minute access token + a 7-day refresh token in an httpOnly cookie. A leaked access token is far less dangerous; a leaked refresh token can still only get a new access token, not bypass the system entirely, and can be revoked by clearing it server-side if you add a denylist later.

**4. `createTeacher` builds the role from `req.body.roles` via a `setRole` middleware that's only wired into one specific route.** There was no general-purpose "admin creates a user with whatever role I specify" endpoint — that's the actual gap this phase fills.

---

## Files created in this phase

```
backend/src/
├── utils/
│   ├── token.ts              # JWT sign/verify for access + refresh tokens
│   └── password.ts           # temp password generator for admin-created accounts
├── types/
│   └── express.d.ts          # augments Express's Request with req.user
├── middleware/
│   ├── auth.ts                # protect (verify token) + restrictTo (RBAC)
│   └── validate.ts            # generic Zod validation middleware
├── validators/
│   ├── auth.validators.ts     # login, change-password schemas
│   └── admin.validators.ts    # create-user, CSV row, status-update schemas
├── services/
│   ├── auth.service.ts        # login, refresh, change-password logic
│   └── admin.service.ts       # create user, bulk CSV import, list/disable/delete
├── controllers/
│   ├── auth.controller.ts     # thin HTTP layer over auth.service
│   └── admin.controller.ts    # thin HTTP layer over admin.service
└── routes/
    ├── auth.routes.ts         # POST /login, /refresh, /logout, /change-password, GET /me
    └── admin.routes.ts        # all admin-only, all gated by protect+restrictTo('admin')
```

All of these are in the zip — copy them into your project at the matching paths.

---

## How the pieces fit together

### `utils/token.ts`
Two signing functions, two verify functions — one pair for access tokens (short-lived, sent in the `Authorization` header), one pair for refresh tokens (long-lived, sent only via httpOnly cookie). Separating these means a compromised access token (e.g. leaked in a log, or grabbed from browser memory via XSS) can't be used to mint new tokens — only the refresh token, sitting in an httpOnly cookie that JavaScript can't read, can do that.

### `middleware/auth.ts` — `protect` and `restrictTo`
`protect` replaces `verifyToken`. The meaningful addition: it re-checks the user's `status` in the database on every request, not just at login. If an admin disables an account mid-session, the very next request from that user is rejected — the old code had no equivalent check, so a disabled/deleted user's still-valid 90-day token kept working until it naturally expired.

`restrictTo(...roles)` replaces `allow(...roles)` — same calling convention, drop-in compatible if you've seen the old code, just typed against the `UserRole` union so `restrictTo('admn')` (typo) is a compile error instead of a silent always-false check.

### `services/auth.service.ts` — `loginUser`
One function, no role parameter, no role-specific branching. It looks up by email, checks `status`, checks password, returns the role as part of the user object. The frontend's single `<LoginPage />` (built in the frontend phase) reads `role` from the response and routes accordingly — the backend doesn't need to know or care which dashboard the frontend ends up showing.

One specific, deliberate choice: the error message for "no such user" and "wrong password" is identical (`"Incorrect email or password"`). Distinguishing them lets an attacker enumerate which emails have accounts on the system — a small thing, but it's the kind of small thing worth doing correctly from the start.

### `services/admin.service.ts` — `createUser` and `bulkImportUsers`
`createUser` is the single-account replacement for both old registration flows. It generates a random temporary password server-side (the new user never chooses their own initial password, since they don't exist in the system yet to choose one) and sets `mustChangePassword: true`. The temp password is returned **once**, in the API response to the admin who made the request — it is never stored anywhere in plaintext and never retrievable again after that response. It's on the admin to relay it (email, in-person, whatever the institution's onboarding process already is).

`bulkImportUsers` takes a CSV buffer and processes it row-by-row, independently — one malformed row (bad email, missing role) is recorded in a `skipped` list with a specific reason, and doesn't abort the rest of the batch. This matters in practice: a university importing 300 students from a registrar's export will have a few bad rows, and you don't want one typo to mean zero accounts got created.

Expected CSV format:
```csv
email,name,role,department,subjects
aisha.khan@university.edu,Aisha Khan,student,Computer Science,
priya.sharma@university.edu,Dr. Priya Sharma,mentor,Computer Science,"Algorithms,Data Structures"
```
`subjects` is comma-separated within a quoted cell, mentor-only, optional.

### `routes/admin.routes.ts`
```typescript
router.use(protect, restrictTo("admin"));
```
This one line at the top of the file is the fix for finding #2 above — every route defined after it in this file inherits both checks. No route in this file can be accidentally left unprotected the way `admin/:id` was in the original.

---

## API surface after this phase

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | public, rate-limited | The one login endpoint, all roles |
| POST | `/api/v1/auth/refresh` | public (reads cookie) | Exchange refresh token for new access token |
| POST | `/api/v1/auth/logout` | public | Clears the refresh cookie |
| GET | `/api/v1/auth/me` | authenticated | Returns the current user from the token |
| PATCH | `/api/v1/auth/change-password` | authenticated | Self-service password change |
| GET | `/api/v1/admin/users` | admin only | List users, filterable by `role`/`department` |
| POST | `/api/v1/admin/users` | admin only | Create one account (any role) |
| POST | `/api/v1/admin/users/bulk-import` | admin only | CSV upload, multipart form field `file` |
| PATCH | `/api/v1/admin/users/:id/status` | admin only | Enable/disable an account |
| DELETE | `/api/v1/admin/users/:id` | admin only | Delete account + cascade-delete their appointments/messages |

Note there is **no** `POST /api/v1/student/register` or `POST /api/v1/mentor/register` anywhere in this list — not hidden, not disabled, simply not defined. That's intentional; it's not possible to accidentally re-expose a route that doesn't exist in the router.

---

## What was actually tested vs. what's reviewed-but-unverified

Being precise about this rather than implying uniform confidence:

**Type-checked clean (verified):** every file in this phase compiles with zero TypeScript errors against the full Phase 1+2+3 codebase.

**Actually executed and verified correct (verified):** the Zod validators and the temp-password generator are pure logic with no database dependency, so I compiled and ran them directly:
- A valid login payload passes, an invalid one (bad email format) is rejected
- The discriminated union correctly requires `department` for `student`/`mentor` roles but not `admin`
- Two consecutive calls to `generateTempPassword()` produce different values, each at least 8 characters (the codebase's minimum)
- A valid CSV row schema passes

**Reviewed carefully but not run end-to-end (the honest gap):** `loginUser`, `bulkImportUsers`, and the full request/response cycle through Express all need a real MongoDB connection, which this sandbox can't reach (same limitation as Phase 2 — no local `mongod`, and MongoDB's download hosts aren't on the network allowlist here). The logic follows the same patterns already verified in Phase 2's model tests (password hashing, schema validation), so I'm confident in it, but you should be the one to actually run `npm run seed` then hit `POST /api/v1/auth/login` with one of the seeded accounts and confirm you get back a 200 with an access token, before building Phase 4 on top of it.

A good first manual test once your `.env` and MongoDB are live:
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@university.edu","password":"Admin@12345"}'
```
You should get back `{"status":"success","data":{"user":{...,"role":"admin"},"accessToken":"..."}}`. Then test the admin-only gate is actually working by trying `GET /api/v1/admin/users` with no `Authorization` header — it should 401, not 200.

---

**Next:** Phase 4 — finishing out the admin module (the routes are built here, but we haven't yet covered the analytics aggregation endpoints from the roadmap) — or jump straight to Phase 5 (mentor module: slot creation, the atomic booking logic, approval workflow) if you'd rather get the core appointment flow working before circling back to analytics. Your call on order — say which, or just "go" for the default order.
