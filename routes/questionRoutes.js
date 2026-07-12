// routes/questionRoutes.js (student)

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import { getQuestionsByTest } from "../controllers/questionController.js";

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  authorize("student", "admin"),
  getQuestionsByTest
);

export default router;