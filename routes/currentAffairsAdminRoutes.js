// routes/currentAffairsAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import upload from "../middleware/upload.js";
import {
  createCurrentAffairs,
  updateCurrentAffairs,
  deleteCurrentAffairs,
} from "../controllers/currentAffairsController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

const uploadImage = upload.single("currentAffairsImage");

router.post("/", uploadImage, createCurrentAffairs);
router.patch("/:id", uploadImage, updateCurrentAffairs);
router.delete("/:id", deleteCurrentAffairs);

export default router;
