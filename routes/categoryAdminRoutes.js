import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

import {
  createCategory,
  updateCategory,
  deleteCategory
} from "../controllers/categoryController.js";

const router = express.Router();

// 🔐 All admin routes
router.use(authMiddleware, authorize("admin"));

const uploadImage = upload.single("categoryImage");

router.post("/", uploadImage, createCategory);
router.patch("/:id", uploadImage, updateCategory);
router.delete("/:id", deleteCategory);

export default router;