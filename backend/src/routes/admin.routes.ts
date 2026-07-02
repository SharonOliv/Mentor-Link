import { Router } from "express";
import multer from "multer";
import * as adminController from "../controllers/admin.controller";
import { protect, restrictTo } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createUserSchema, updateUserStatusSchema } from "../validators/admin.validators";

const router = Router();

// Every route below is admin-only — this entire file is the "admin creates
// everyone" pivot. No self-registration route exists anywhere in this app.
router.use(protect, restrictTo("admin"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB is plenty for a few thousand rows of CSV
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "text/csv" && !file.originalname.endsWith(".csv")) {
      cb(new Error("Only CSV files are accepted"));
      return;
    }
    cb(null, true);
  },
});

router.get("/users", adminController.listUsers);
router.post("/users", validateBody(createUserSchema), adminController.createUser);
router.post("/users/bulk-import", upload.single("file"), adminController.bulkImportUsers);
router.patch(
  "/users/:id/status",
  validateBody(updateUserStatusSchema),
  adminController.setUserStatus
);
router.delete("/users/:id", adminController.deleteUser);

export default router;
