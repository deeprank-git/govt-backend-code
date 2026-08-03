// routes/currentAffairsRoutes.js (student/public)

import express from "express";
import authMiddleware, { optionalAuth } from "../middleware/authMiddleware.js";
import {
  getCurrentAffairs,
  getCurrentAffairsById,
  recordCurrentAffairsView,
  getCurrentAffairsStreak,
} from "../controllers/currentAffairsController.js";

const router = express.Router();

// DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was router.use(authMiddleware);
// ✅ Public — no login required (2026-07-28)
router.use(optionalAuth);

// /streak is auth-required and must be registered before the "/:id" GET
// below, or Express would try to match "streak" as an :id.
router.get("/streak", authMiddleware, getCurrentAffairsStreak);

router.get("/", getCurrentAffairs);
router.post("/:id/record-view", authMiddleware, recordCurrentAffairsView);
router.get("/:id", getCurrentAffairsById);

export default router;
