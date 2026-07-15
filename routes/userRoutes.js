// routes/userRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getMe, updateMe } from "../controllers/authController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/me", getMe);
router.put("/me", updateMe);

export default router;
