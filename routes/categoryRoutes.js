import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  getCategories,
  getCategoryById
} from "../controllers/categoryController.js";

const router = express.Router();

// ✅ Accessible to all logged-in users
router.get(
  "/",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getCategories
);

router.get(
  "/:id",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getCategoryById
);

export default router;