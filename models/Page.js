// models/Page.js

import mongoose from "mongoose";

const pageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Mixed on purpose — some pages may just be a single HTML/markdown
    // blob (`content: "<p>...</p>"`), others may want structured
    // sections later (`content: { blocks: [...] }`). Kept flexible per
    // the original doc's note that Page is "a flexible module".
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: "",
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Page", pageSchema);
