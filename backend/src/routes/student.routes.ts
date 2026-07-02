import { Router } from "express";
import * as studentController from "../controllers/student.controller";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

router.use(protect, restrictTo("student"));

router.get("/mentors", studentController.listMentors);
router.get("/mentors/:mentorId/slots", studentController.getMentorSlots);
router.patch("/slots/:id/book", studentController.bookSlot);
router.get("/bookings", studentController.getMyBookings);

export default router;
