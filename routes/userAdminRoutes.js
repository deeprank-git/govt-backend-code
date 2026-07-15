// routes/userAdminRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import authorize from "../middleware/authorize.js";
import { getAllUsers, getUserById, updateUserByAdmin } from "../controllers/authController.js";

const router = express.Router();

router.use(authMiddleware, authorize("admin"));

router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.patch("/:id", updateUserByAdmin);

export default router;
