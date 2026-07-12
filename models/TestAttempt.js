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

export default mongoose.model("TestAttempt", testAttemptSchema);