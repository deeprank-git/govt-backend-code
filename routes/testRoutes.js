import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  getTests,
  getTestById,
} from "../controllers/testController.js";

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getTests
);

router.get(
  "/:id",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getTestById
);

export default router;