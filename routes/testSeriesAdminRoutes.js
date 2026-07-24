import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

import {
  createTestSeries,
  updateTestSeries,
  deleteTestSeries,
} from "../controllers/testSeriesController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/", upload.single("image"), createTestSeries);
router.patch("/:id", upload.single("image"), updateTestSeries);
router.delete("/:id", deleteTestSeries);

export default router;