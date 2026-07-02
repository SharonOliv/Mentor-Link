import { Router } from "express";
import * as notificationController from "../controllers/notification.controller";
import { protect } from "../middleware/auth";

const router = Router();

// No restrictTo here deliberately — notifications belong to whoever is
// logged in, regardless of role. The queries themselves are scoped to
// req.user.id, so there's nothing role-specific to gate.
router.use(protect);

router.get("/", notificationController.listMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/:id/read", notificationController.markAsRead);
router.patch("/read-all", notificationController.markAllAsRead);

export default router;
