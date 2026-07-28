import express from "express";
import authMiddleware, { optionalAuth } from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  getCategories,
  getCategoryById
} from "../controllers/categoryController.js";

const router = express.Router();

// ✅ Public — no login required (2026-07-28)
router.get(
  "/",
  // DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was authMiddleware, authorize("student", "admin", "instructor")
  optionalAuth,
  getCategories
);

router.get(
  "/:id",
  // DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was authMiddleware, authorize("student", "admin", "instructor")
  optionalAuth,
  getCategoryById
);

export default router;