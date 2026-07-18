// routes/notificationAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import {
  createNotification,
  getAllNotificationsAdmin,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/", createNotification);
router.get("/", getAllNotificationsAdmin);

export default router;
