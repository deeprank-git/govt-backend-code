// routes/mediaAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import upload from "../middleware/upload.js";
import { uploadMedia, getMedia, deleteMedia } from "../controllers/mediaController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.post("/upload", upload.single("file"), uploadMedia);
router.get("/", getMedia);
router.delete("/:id", deleteMedia);

export default router;
