import { Router } from "express";
import * as mentorController from "../controllers/mentor.controller";
import { protect, restrictTo } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createSlotSchema, createSlotsBatchSchema } from "../validators/mentor.validators";

const router = Router();

router.use(protect, restrictTo("mentor"));

router.get("/slots", mentorController.getMySlots);
router.post("/slots", validateBody(createSlotSchema), mentorController.createSlot);
router.post(
  "/slots/batch",
  validateBody(createSlotsBatchSchema),
  mentorController.createSlotsBatch
);
router.delete("/slots/:id", mentorController.deleteSlot);

router.get("/bookings/pending", mentorController.getPendingBookings);
router.patch("/bookings/:id/approve", mentorController.approveBooking);
router.patch("/bookings/:id/reject", mentorController.rejectBooking);

export default router;
