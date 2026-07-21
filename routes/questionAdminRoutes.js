// routes/questionAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import uploadCsv from "../middleware/uploadCsv.js";

import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionsAdmin,
  bulkCreateQuestions,
  downloadBulkTemplate,
} from "../controllers/questionController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.get("/bulk/template", downloadBulkTemplate);
router.post("/bulk", uploadCsv.single("file"), bulkCreateQuestions);
router.post("/", createQuestion);
router.get("/", getQuestionsAdmin);
router.patch("/:id", updateQuestion);
router.delete("/:id", deleteQuestion);

export default router;
