import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    testSeries: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestSeries",
      required: false,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    duration: {
      type: Number,
      required: true,
    },

    totalQuestions: {
      type: Number,
      default: 0,
    },

    totalMarks: {
      type: Number,
      default: 0,
    },

    negativeMarking: {
      type: Boolean,
      default: false,
    },

    negativeMarksPerQuestion: {
      type: Number,
      default: 0,
    },

    marksPerQuestion: {
      type: Number,
      default: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Mongoose 9: pre("save") no longer receives a next() callback — the first
// arg is a SaveOptions object. Just mutate `this` synchronously; no callback needed.
testSchema.pre("save", function () {
  if (this.isModified("title")) {
    this.slug = this.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");
  }
});

export default mongoose.model("Test", testSchema);