import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  getTestSeries,
  getTestSeriesById,
} from "../controllers/testSeriesController.js";

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getTestSeries
);

router.get(
  "/:id",
  authMiddleware,
  authorize("student", "admin", "instructor"),
  getTestSeriesById
);

export default router;