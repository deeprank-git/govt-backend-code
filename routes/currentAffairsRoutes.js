// routes/currentAffairsRoutes.js (student/public)

import express from "express";
import authMiddleware, { optionalAuth } from "../middleware/authMiddleware.js";
import { getCurrentAffairs, getCurrentAffairsById } from "../controllers/currentAffairsController.js";

const router = express.Router();

// DISABLED-FOR-PUBLIC-ACCESS 2026-07-28: was router.use(authMiddleware);
// ✅ Public — no login required (2026-07-28)
router.use(optionalAuth);

router.get("/", getCurrentAffairs);
router.get("/:id", getCurrentAffairsById);

export default router;
