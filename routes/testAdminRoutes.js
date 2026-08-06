import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  createTest,
  createTestWithQuestions,
  updateTest,
  deleteTest,
} from "../controllers/testController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/with-questions", createTestWithQuestions);
router.post("/", createTest);
router.patch("/:id", updateTest);
router.delete("/:id", deleteTest);

export default router;