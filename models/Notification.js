// models/Notification.js

import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // null = broadcast to every user
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["info", "reminder", "result", "offer", "system"],
      default: "info",
    },

    // Only meaningful for targeted (non-broadcast) notifications. For a
    // broadcast (user: null), a single shared isRead would mean one
    // person reading it marks it read for everyone, so broadcasts are
    // always reported as unread here — see readBy below.
    isRead: {
      type: Boolean,
      default: false,
    },

    // Per-user read receipts for broadcast notifications. Empty/unused
    // for targeted notifications, where isRead above is authoritative.
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
