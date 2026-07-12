// routes/questionAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionsAdmin,
  bulkCreateQuestions,
} from "../controllers/questionController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/bulk", bulkCreateQuestions); // 🐛 fix: was GET, now POST
router.post("/", createQuestion);
router.get("/", getQuestionsAdmin);
router.patch("/:id", updateQuestion);
router.delete("/:id", deleteQuestion);

export default router;
