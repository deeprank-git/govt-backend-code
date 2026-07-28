import express from "express";
import authMiddleware, { optionalAuth } from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  getTests,
  getTestById,
} from "../controllers/testController.js";

const router = express.Router();

// ✅ Public — no login required (2026-07-28), matches categories/test-series/current-affairs
router.get(
  "/",
  // DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was authMiddleware, authorize("student", "admin", "instructor")
  optionalAuth,
  getTests
);

// ⚠️ Left protected on purpose — detail/start flow still requires login
router.get(
  "/:id",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getTestById
);

export default router;