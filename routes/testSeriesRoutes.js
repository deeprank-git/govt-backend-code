import express from "express";
import authMiddleware, { optionalAuth } from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  getTestSeries,
  getTestSeriesById,
} from "../controllers/testSeriesController.js";

const router = express.Router();

// ✅ Public — no login required (2026-07-28)
router.get(
  "/",
  // DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was authMiddleware, authorize("student", "admin", "instructor")
  optionalAuth,
  getTestSeries
);

router.get(
  "/:id",
  // DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was authMiddleware, authorize("student", "admin", "instructor")
  optionalAuth,
  getTestSeriesById
);

export default router;