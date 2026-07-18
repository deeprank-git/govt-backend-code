// routes/searchRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { globalSearch } from "../controllers/searchController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", globalSearch);

export default router;
