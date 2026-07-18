// routes/settingAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import { updateSettings } from "../controllers/settingController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.put("/", updateSettings);

export default router;
