import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

import connectDB from './db.js';
import app from './app.js';
import { startAutoSubmitJob } from './cron/autoSubmitJob.js';

// ✅ DB Connection
connectDB();

// ✅ Background job: catches attempts whose timer expired but were never
// touched again (see cron/autoSubmitJob.js for why this exists alongside
// the lazy per-request check already in testAttemptController.js).
startAutoSubmitJob();

// ✅ SERVER
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});
