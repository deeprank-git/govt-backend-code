// models/Report.js

import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },

    // Kept so admins have context even if the attempt is long finished.
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved"],
      default: "pending",
    },

    // Admin's note on how it was resolved (e.g. "fixed correct answer to option C")
    adminNote: {
      type: String,
      default: "",
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
