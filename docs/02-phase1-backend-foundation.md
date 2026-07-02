# Phase 1 — Backend Foundation

Goal: a typed, runnable Express server with proper env handling, DB connection, and error handling — no features yet, just the skeleton everything else plugs into.

Build these files **in this order**. After the last step you'll have a server that boots, connects to MongoDB, and returns a proper JSON error for a 404.

---

## Step 1 — Initialize the backend project

In VS Code terminal, from your project root:

```bash
mkdir backend-v2 && cd backend-v2
npm init -y
npm install express mongoose dotenv cors bcryptjs jsonwebtoken nodemailer zod helmet express-rate-limit cookie-parser
npm install -D typescript ts-node-dev @types/node @types/express @types/cors @types/bcryptjs @types/jsonwebtoken @types/cookie-parser
npx tsc --init
```

Why each package, briefly:
- `helmet` — sets secure HTTP headers (missing entirely from your current server)
- `express-rate-limit` — your current login route has no rate limiting, meaning it's brute-forceable today
- `zod` — request validation, replacing the "trust whatever's in req.body" pattern in your current controllers
- `cookie-parser` — needed for the httpOnly refresh token cookie
- `bcryptjs` instead of `bcrypt` — pure JavaScript, no native compilation step. The original `bcrypt` package needs to compile a native binary on install, which fails on some hosts/sandboxes without C++ build tools and can complicate deploying to Render/Vercel. `bcryptjs` is slightly slower but functionally identical and has zero install friction — worth it for a project you're about to deploy.

We're keeping `mongoose`, `jsonwebtoken`, `nodemailer` — same libraries you already use, just typed.

---

## Step 2 — Create: `backend/tsconfig.json`

**Why:** `npx tsc --init` generates a huge file full of commented-out options. Replace its contents with this — a config tuned for a Node/Express backend with strict type checking on, which is what catches the kind of bug we just found in `AppError.js` (a silent no-op assignment) before it ships.

> **Note on TypeScript version:** at the time of writing, `npm install typescript` resolves to **TypeScript 6.0.x** (not 5.x) — the registry's stable line has moved forward. The config below is verified clean against 6.0.3 with zero deprecation warnings. If you've got an older tutorial or AI-generated config lying around with `"moduleResolution": "node"` and `"baseUrl"`/`"paths"`, drop those — both are deprecated in 6.0 and will hard-error in TS 7. This project doesn't use path aliases, so we just skip them rather than fight the deprecation.

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`"types": ["node"]` is needed explicitly in 6.0 — without it, TypeScript won't pick up Node globals like `process`, `__dirname`, and `console` even with `@types/node` installed.

---

## Step 3 — Create: `backend/.env.example`

**Why:** documents every variable the app needs without committing real secrets. Your current `.env.example` is missing several values we'll need (refresh token secret, Google OAuth, frontend URL for CORS).

```bash
# Server
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

# Database
DB_URL=mongodb://127.0.0.1:27017/faculty-appointments

# Auth
JWT_ACCESS_SECRET=replace_with_a_long_random_string
JWT_REFRESH_SECRET=replace_with_a_different_long_random_string
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email (Nodemailer)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_email@gmail.com
MAIL_PASS=your_app_password

# Google Calendar integration (added in Phase 10 — leave blank for now)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

Copy this to `backend/.env` and fill in real values. `.env` must be in `.gitignore` (it already is in your existing project).

---

## Step 4 — Create: `backend/src/config/env.ts`

**Why:** your current code reads `process.env.X` directly all over the codebase with no check that it actually exists — if you forget to set `JWT_KEY` in production, the app silently signs tokens with `undefined` as the secret instead of failing loudly at startup. This file centralizes env access and fails fast on boot if anything required is missing.

```typescript
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

  isProduction: process.env.NODE_ENV === "production",
};
```

This will throw on startup if `DB_URL`, `JWT_ACCESS_SECRET`, or `JWT_REFRESH_SECRET` aren't set — that's intentional. A backend that boots successfully without its DB connection string is worse than one that refuses to start.

---

## Step 5 — Create: `backend/src/config/db.ts`

**Why:** typed version of your existing `db.js`, with one real fix — your current version logs the error and continues running with no database connection at all, masking failures. This version logs and exits, so a broken DB connection is visible immediately instead of surfacing later as confusing 500s.

```typescript
import mongoose from "mongoose";
import { env } from "./env";

export const connectToDatabase = async (): Promise<void> => {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.dbUrl);
    console.log("[database] connected");
  } catch (error) {
    console.error("[database] connection failed:", error);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("[database] disconnected");
});
```

---

## Step 6 — Create: `backend/src/utils/AppError.ts`

**Why:** fixes the bug in your current `AppError.js` where `statusCode` was never actually set (`this.statusCode = this.statusCode` assigns `undefined` to itself). Every error in the current app returns HTTP 500 regardless of intent — a 404 "user not found" and a real server crash look identical to API consumers. This version actually stores the code.

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: "fail" | "error";
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? "error" : "fail";
    this.isOperational = true;

    Object.setPrototypeOf(this, AppError.prototype);
  }
}
```

---

## Step 7 — Create: `backend/src/utils/catchAsync.ts`

**Why:** typed version of your existing `catchAsync.js` — same pattern (wrap an async route handler so thrown errors reach Express's error middleware instead of crashing the process), just with proper types so TypeScript can check route handler signatures.

```typescript
import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

export const catchAsync = (fn: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
```

---

## Step 8 — Create: `backend/src/middleware/errorHandler.ts`

**Why:** your current `errorController.js` always returns `err.stack` in the JSON response, in every environment, including production — that's a real information leak (stack traces reveal file paths, internal structure, sometimes query details). This version only includes the stack in development, and distinguishes operational errors (things you threw on purpose, like "wrong password") from programming errors (things that actually crashed).

```typescript
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const status = isAppError ? err.status : "error";

  if (!isAppError) {
    // Unexpected error — log full detail server-side, don't leak it to the client
    console.error("[unexpected error]", err);
  }

  res.status(statusCode).json({
    status,
    message: isAppError ? err.message : "Something went wrong",
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status: "fail",
    message: `Route ${req.originalUrl} not found`,
  });
};
```

---

## Step 9 — Create: `backend/src/server.ts`

**Why:** the composition root — typed version of your `index.js`, with `helmet` and rate limiting added (both absent from your current server), and routes wired in as they're built in later phases. Right now it boots with no feature routes — that's expected, they arrive in Phase 3 onward.

```typescript
import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { connectToDatabase } from "./config/db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app: Application = express();

// Security headers
app.use(helmet());

// CORS — locked to the configured frontend origin, not wide open like the current `cors()` with no options
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true, // required so the httpOnly refresh-token cookie is sent
  })
);

app.use(express.json());
app.use(cookieParser());

// Basic rate limiting — applied globally here; auth routes get a stricter limit in Phase 3
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

// Feature routes are mounted here in later phases, e.g.:
// import authRoutes from "./routes/auth.routes";
// app.use("/api/v1/auth", authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const start = async (): Promise<void> => {
  await connectToDatabase();
  app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port}`);
  });
};

start();
```

---

## Step 10 — Update: `backend/package.json`

**Why:** swaps `nodemon index.js` for `ts-node-dev`, which restarts on change like nodemon but understands TypeScript directly — no separate compile step needed during development. Also pins `typescript` to the current stable `^6.0.3` explicitly — letting it float to "latest" silently moved it from the 5.x most tutorials assume, which is exactly what caused the `moduleResolution`/`baseUrl` deprecation warnings above. Pin it so your build doesn't shift under you.

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

(Merge these into your existing `package.json` — don't replace the whole file, just update `scripts` and add the version pin under `devDependencies`.)

---

## Verify Phase 1 works

```bash
npx tsc --noEmit
```

This should report **zero errors**. If you see deprecation warnings about `moduleResolution` or `baseUrl`, you're on an old config — double check Step 2 was applied exactly.

Then:

```bash
npm run dev
```

You should see:
```
[database] connected
[server] listening on port 5000
```

Visit `http://localhost:5000/` in a browser — you should get `{"status":"ok","message":"Faculty Appointment API"}`.

Visit `http://localhost:5000/nonsense` — you should get a clean 404 JSON response, not a stack trace, not an HTML error page.

If `npm run dev` throws `Missing required environment variable: DB_URL` (or hangs with no log output at all because Mongo isn't reachable) — both are `env.ts`/`db.ts` working exactly as designed: fail loudly rather than silently limping along with no database. Fill in your `.env` with a real `DB_URL` (local Mongo or an Atlas connection string) and run again.

---

**Next:** Phase 2 — typed Mongoose models (User, Appointment, Notification, Message), replacing the array-of-students Appointment design with the slot/booking split from the roadmap doc. Say "go" when ready.
