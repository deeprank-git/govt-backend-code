// routes/pageRoutes.js (public — no login required, e.g. About/Contact)

import express from "express";
import { getPageBySlug } from "../controllers/pageController.js";

const router = express.Router();

router.get("/:slug", getPageBySlug);

export default router;
