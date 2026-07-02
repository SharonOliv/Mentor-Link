import { Router } from "express";
import * as analyticsController from "../controllers/analytics.controller";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

router.use(protect, restrictTo("admin"));
router.get("/summary", analyticsController.getSummary);

export default router;
