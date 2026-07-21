// routes/userRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import { getMe, updateMe } from "../controllers/authController.js";
import { reportQuestion } from "../controllers/reportController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/me", getMe);
router.put("/me", upload.single("profilePicture"), updateMe);
router.post("/me/report-question", reportQuestion);

export default router;
