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

const testSeriesUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "notificationPdf", maxCount: 1 },
  { name: "infoPdf", maxCount: 1 },
]);

router.post("/", testSeriesUpload, createTestSeries);
router.patch("/:id", testSeriesUpload, updateTestSeries);
router.delete("/:id", deleteTestSeries);

export default router;