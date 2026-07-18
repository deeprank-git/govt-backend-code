// cron/autoSubmitJob.js
//
// Real background auto-submit, as originally scoped ("node-cron —
// Checks and auto-submits tests when time is over"). This SUPPLEMENTS
// rather than replaces the lazy check already in testAttemptController.js
// (autoSubmitIfExpired, run whenever an attempt is touched) — that one
// still gives an instant "your test just ended" response mid-request.
// This job's job is to catch the case the lazy check can't: a student
// who starts a test and never comes back. Without this, that attempt
// would sit "in-progress" in the database forever.

import TestAttempt from "../models/TestAttempt.js";
import { finalizeAttempt } from "../controllers/testAttemptController.js";

const RUN_EVERY_MS = 60 * 1000; // once a minute is plenty for a mock-test timer

export const runAutoSubmitSweep = async () => {
  try {
    const expired = await TestAttempt.find({
      status: "in-progress",
      expiresAt: { $lt: new Date() },
    });

    if (expired.length === 0) return;

    await Promise.all(expired.map((attempt) => finalizeAttempt(attempt, "auto-submitted")));

    console.log(`[autoSubmitJob] auto-submitted ${expired.length} expired attempt(s)`);
  } catch (error) {
    console.error("[autoSubmitJob] sweep failed:", error.message);
  }
};

// Starts the interval. Call this once from index.js after the DB connects.
export const startAutoSubmitJob = () => {
  setInterval(runAutoSubmitSweep, RUN_EVERY_MS);
  console.log(`[autoSubmitJob] started — sweeping every ${RUN_EVERY_MS / 1000}s`);
};
