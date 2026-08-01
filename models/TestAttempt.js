// models/TestAttempt.js

import mongoose from "mongoose";

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Question",
  },
  selectedOption: Number,
  isCorrect: Boolean,
});

const testAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
    },

    answers: [answerSchema],

    score: {
      type: Number,
      default: 0,
    },

    totalMarks: Number,

    correctCount: {
      type: Number,
      default: 0,
    },

    wrongCount: {
      type: Number,
      default: 0,
    },

    currentQuestionIndex: {
      type: Number,
      default: 0,
    },

    startedAt: Date,

    // startedAt + test.duration -> when this attempt should auto-submit
    expiresAt: Date,

    submittedAt: Date,

    status: {
      type: String,
      enum: ["in-progress", "paused", "completed", "auto-submitted"],
      default: "in-progress",
    },

    // Timestamp of the most recent pause; null whenever status !== "paused".
    pausedAt: {
      type: Date,
      default: null,
    },

    // Cumulative time (ms) spent paused across the whole attempt so far.
    // Added to `expiresAt` (never mutated itself) to get the "effective"
    // deadline — see computeRemainingSeconds() in testAttemptController.js.
    totalPausedDurationMs: {
      type: Number,
      default: 0,
    },

    // How many times this attempt has been paused — only enforced against
    // Test.maxPauses when that field is set (see testAttemptController.js).
    pauseCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Enforces "at most one in-progress attempt per user/test" at the DB level —
// closes the race condition where two near-simultaneous /start requests could
// both pass the "no in-progress attempt exists yet" check and each create one
// (retakes are unaffected: this only applies while status is "in-progress").
testAttemptSchema.index(
  { user: 1, test: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "in-progress" },
    // MongoDB auto-generates index names from the key pattern alone, which
    // ignores partialFilterExpression — without distinct explicit names,
    // this collides with the "paused" index below (same {user:1,test:1}
    // pattern) and only one of the two actually gets created.
    name: "uniq_inprogress_attempt_per_user_test",
  }
);

// Same protection, extended to "paused": without this, pausing an attempt
// (which doesn't touch the "in-progress" index above) would leave a window
// where a concurrent /start could create a second, genuinely-in-progress
// attempt for the same user/test while the first sits paused. The app-level
// guard in startTest() is the primary defense; this is the race backstop,
// same pattern as the index above.
testAttemptSchema.index(
  { user: 1, test: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "paused" },
    name: "uniq_paused_attempt_per_user_test",
  }
);

export default mongoose.model("TestAttempt", testAttemptSchema);