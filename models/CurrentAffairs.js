// models/CurrentAffairs.js

import mongoose from "mongoose";

const currentAffairsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: String,
      required: true,
    },

    summary: {
      type: String,
      default: "",
    },

    date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    category: {
      type: String, // e.g. "National", "International", "Sports", "Economy"
      default: "General",
      trim: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    image: {
      type: String,
      default: "",
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    // Not in the original schema sketch, added to match the soft-delete
    // convention used by every other module in this codebase.
    isActive: {
      type: Boolean,
      default: true,
    },

    views: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

currentAffairsSchema.index({ date: -1 });
currentAffairsSchema.index({ title: "text", content: "text", tags: "text" });

export default mongoose.model("CurrentAffairs", currentAffairsSchema);
