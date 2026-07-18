// routes/currentAffairsAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import {
  createCurrentAffairs,
  updateCurrentAffairs,
  deleteCurrentAffairs,
} from "../controllers/currentAffairsController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/", createCurrentAffairs);
router.patch("/:id", updateCurrentAffairs);
router.delete("/:id", deleteCurrentAffairs);

export default router;
