import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import userRouter from './routes/authRoutes.js';
import connectDB from './db.js';

import categoryRoutes from './routes/categoryRoutes.js';
import adminCategoryRoutes from './routes/categoryAdminRoutes.js';

// ✅ NEW IMPORTS 
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


dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:8080',      
  'http://localhost:3000',      
];

app.use(cors({
  origin: function (origin, callback) {
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

// ✅ DB Connection
connectDB();

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

// ✅ SERVER
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});