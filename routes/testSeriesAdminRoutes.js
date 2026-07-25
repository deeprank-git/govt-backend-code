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

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "notificationPdf", maxCount: 1 },
]);

router.post("/", uploadFields, createTestSeries);
router.patch("/:id", uploadFields, updateTestSeries);
router.delete("/:id", deleteTestSeries);

export default router;