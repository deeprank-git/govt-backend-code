import express from "express";
import mongoose from "mongoose";
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

// No TestSeries _id exists yet at Create time (multer's filename callback runs
// before the doc is ever saved) — pre-generate it here so uploaded files can be
// named with the same id the controller then persists the doc under.
const assignUploadEntityId = (req, res, next) => {
  req.uploadEntityId = new mongoose.Types.ObjectId();
  next();
};

router.post("/", assignUploadEntityId, uploadFields, createTestSeries);
router.patch("/:id", uploadFields, updateTestSeries);
router.delete("/:id", deleteTestSeries);

export default router;