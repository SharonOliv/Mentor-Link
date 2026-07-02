import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/auth.controller";
import { protect } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loginSchema, changePasswordSchema } from "../validators/auth.validators";

const router = Router();

// Login gets its own stricter limit on top of the global one — the current
// app has zero rate limiting on login, making it brute-forceable today.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { status: "fail", message: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// One endpoint for every role. The frontend never needs to know or guess
// which role an email belongs to before calling this.
router.post("/login", loginLimiter, validateBody(loginSchema), authController.login);

router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

router.get("/me", protect, authController.getMe);
router.patch(
  "/change-password",
  protect,
  validateBody(changePasswordSchema),
  authController.changePassword
);

export default router;
