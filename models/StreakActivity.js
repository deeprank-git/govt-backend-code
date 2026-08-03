// models/StreakActivity.js
//
// One row per (user, calendar day) that had current-affairs reading
// activity. Kept as its own collection rather than an array on User because
// it needs to be queried by date range (the Mon–Sun weekly widget) and
// audited independently — see currentAffairsController.js.

import mongoose from "mongoose";

const streakActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Date-only, always normalized to midnight UTC (see utils/dateOnly.js).
    date: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// One activity row per user per day — also makes "already logged today?"
// a fast indexed lookup, and lets a duplicate insert (e.g. a double-click)
// fail safely instead of creating a second row for the same day.
streakActivitySchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model("StreakActivity", streakActivitySchema);
