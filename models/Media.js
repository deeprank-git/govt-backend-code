// models/Media.js

import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },

    // relative path on disk (used internally to delete the file later)
    filePath: {
      type: String,
      required: true,
    },

    originalName: {
      type: String,
      default: "",
    },

    mimeType: {
      type: String,
      default: "",
    },

    size: {
      type: Number, // bytes
      default: 0,
    },

    type: {
      type: String,
      enum: ["image", "video", "document"],
      default: "image",
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Where this file is currently used, so an admin knows what breaks
    // if they delete it. Set by the client when it links media to a
    // record (e.g. after uploading a Test banner image).
    usedInRefType: {
      type: String,
      enum: ["Test", "Question", "Page", "TestSeries", "CurrentAffairs", "Category", null],
      default: null,
    },

    usedInRefId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);
