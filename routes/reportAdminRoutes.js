// routes/reportAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import { getReports, updateReport } from "../controllers/reportController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.get("/", getReports);
router.patch("/:id", updateReport);

export default router;
