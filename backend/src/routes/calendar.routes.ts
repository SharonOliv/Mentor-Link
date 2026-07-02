import { Router } from "express";
import * as calendarController from "../controllers/calendar.controller";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

// The callback route is NOT behind `protect` — Google's redirect is a
// plain browser GET with no Authorization header at all. The mentor's
// identity comes from the `state` parameter round-tripped through Google,
// not from a bearer token. This is the standard shape of an OAuth
// authorization-code callback, not an oversight.
router.get("/callback", calendarController.handleCallback);

router.use(protect, restrictTo("mentor"));
router.get("/connect", calendarController.getConnectUrl);
router.get("/status", calendarController.getStatus);
router.delete("/disconnect", calendarController.disconnect);

export default router;
