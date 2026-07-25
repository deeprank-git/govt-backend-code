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
      enum: ["in-progress", "completed", "auto-submitted"],
      default: "in-progress",
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
  { unique: true, partialFilterExpression: { status: "in-progress" } }
);

export default mongoose.model("TestAttempt", testAttemptSchema);