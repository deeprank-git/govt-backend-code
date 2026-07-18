// models/RefreshToken.js

import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    token: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    device: {
      type: String,
      default: "",
    },

    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Mongo TTL index — once a token's expiresAt passes, the document is
// automatically removed by MongoDB itself (no cron needed for cleanup).
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RefreshToken", refreshTokenSchema);
