// routes/currentAffairsRoutes.js (student/public)

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getCurrentAffairs, getCurrentAffairsById } from "../controllers/currentAffairsController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCurrentAffairs);
router.get("/:id", getCurrentAffairsById);

export default router;
