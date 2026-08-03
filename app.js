// app.js
//
// Express app wiring only — no dotenv, DB connection, cron start, or
// app.listen(). Split out of index.js so it can be imported directly by
// tests (via supertest) without booting the real database connection or
// the auto-submit background job. index.js is the only thing that should
// actually run this app.

import express from 'express';
import cors from 'cors';

import userRouter from './routes/authRoutes.js';

import categoryRoutes from './routes/categoryRoutes.js';
import adminCategoryRoutes from './routes/categoryAdminRoutes.js';

import testSeriesRoutes from './routes/testSeriesRoutes.js';
import testSeriesAdminRoutes from './routes/testSeriesAdminRoutes.js';

import testRoutes from './routes/testRoutes.js';
import testAdminRoutes from './routes/testAdminRoutes.js';

import questionRoutes from "./routes/questionRoutes.js";
import questionAdminRoutes from "./routes/questionAdminRoutes.js";

import testAttemptRoutes from "./routes/testAttemptRoutes.js";

import userRoutes from "./routes/userRoutes.js";
import userAdminRoutes from "./routes/userAdminRoutes.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";

import currentAffairsRoutes from "./routes/currentAffairsRoutes.js";
import currentAffairsAdminRoutes from "./routes/currentAffairsAdminRoutes.js";
import mediaAdminRoutes from "./routes/mediaAdminRoutes.js";
import pageRoutes from "./routes/pageRoutes.js";
import pageAdminRoutes from "./routes/pageAdminRoutes.js";
import reportAdminRoutes from "./routes/reportAdminRoutes.js";
import settingRoutes from "./routes/settingRoutes.js";
import settingAdminRoutes from "./routes/settingAdminRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import notificationAdminRoutes from "./routes/notificationAdminRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import analyticsAdminRoutes from "./routes/analyticsAdminRoutes.js";

import { UPLOAD_DIR } from "./middleware/upload.js";

const app = express();

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:8080'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json());

// ✅ Serve uploaded media (images/videos/pdfs) statically
app.use("/uploads", express.static(UPLOAD_DIR));

// ✅ AUTH
app.use('/api/auth', userRouter);

// ✅ CATEGORY
app.use('/api/categories', categoryRoutes);
app.use('/api/admin/categories', adminCategoryRoutes);

// ✅ TEST SERIES
app.use('/api/test-series', testSeriesRoutes);
app.use('/api/admin/test-series', testSeriesAdminRoutes);

// ✅ TESTS
app.use('/api/tests', testRoutes);
app.use('/api/admin/tests', testAdminRoutes);

app.use("/api/questions", questionRoutes);
app.use("/api/admin/questions", questionAdminRoutes);

app.use("/api/test-attempts", testAttemptRoutes);

// ✅ USERS (self-service + admin management)
app.use("/api/users", userRoutes);
app.use("/api/admin/users", userAdminRoutes);

// ✅ LEADERBOARD
app.use("/api/leaderboard", leaderboardRoutes);

// ✅ CURRENT AFFAIRS
app.use("/api/current-affairs", currentAffairsRoutes);
app.use("/api/admin/current-affairs", currentAffairsAdminRoutes);

// ✅ MEDIA (upload)
app.use("/api/admin/media", mediaAdminRoutes);

// ✅ STATIC PAGES (About/Contact etc.)
app.use("/api/pages", pageRoutes);
app.use("/api/admin/pages", pageAdminRoutes);

// ✅ QUESTION REPORTS (admin review side; student side lives under /api/users/me/report-question)
app.use("/api/admin/reports", reportAdminRoutes);

// ✅ SITE SETTINGS
app.use("/api/settings", settingRoutes);
app.use("/api/admin/settings", settingAdminRoutes);

// ✅ NOTIFICATIONS
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/notifications", notificationAdminRoutes);

// ✅ GLOBAL SEARCH
app.use("/api/search", searchRoutes);

// ✅ ADMIN ANALYTICS
app.use("/api/admin/analytics", analyticsAdminRoutes);

// ✅ HEALTH CHECK
app.get("/api/health", (req, res) => {
    res.status(200).json({ success: true, message: "GovtPrep API is running" });
});

// ✅ 404 - unknown route
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ✅ GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error",
    });
});

export default app;
