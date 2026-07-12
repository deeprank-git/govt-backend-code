import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";

import {
  createTestSeries,
  updateTestSeries,
  deleteTestSeries,
} from "../controllers/testSeriesController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/", createTestSeries);
router.patch("/:id", updateTestSeries);
router.delete("/:id", deleteTestSeries);

export default router;