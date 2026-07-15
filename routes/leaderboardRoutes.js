// routes/leaderboardRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getLeaderboard } from "../controllers/testAttemptController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/:testId", getLeaderboard);

export default router;
