// routes/testAttemptRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";

import {
  startTest,
  getQuestionByIndex,
  saveAnswer,
  submitTest,
  getResult,
  getMyAttempts,
  pauseAttempt,
  resumeAttempt,
} from "../controllers/testAttemptController.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/start", startTest);
router.get("/my-attempts", getMyAttempts);
router.get("/:id/question/:index", getQuestionByIndex);
router.post("/save-answer", saveAnswer);
router.post("/submit", submitTest);
router.get("/:id/result", getResult);
router.post("/:attemptId/pause", pauseAttempt);
router.post("/:attemptId/resume", resumeAttempt);

export default router;
