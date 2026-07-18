// routes/pageAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import {
  getAllPagesAdmin,
  createPage,
  updatePage,
  deletePage,
} from "../controllers/pageController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.get("/", getAllPagesAdmin);
router.post("/", createPage);
router.patch("/:id", updatePage);
router.delete("/:id", deletePage);

export default router;
