import mongoose from "mongoose";
import { slugify } from "../utils/slugify.js";

const sectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  no_of_questions: {
    type: Number,
    required: true,
  },
  no_of_marks: {
    type: Number,
    required: true,
  },
  duration: {
    type: Number,
    required: true,
  },
});

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
      required: true,
    },

    paperType: {
      type: String,
      enum: ["mock", "previous_year"],
      default: "mock",
    },

    // Only meaningful when paperType === "previous_year"
    examDate: {
      type: Date,
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

    // Denormalized count of TestAttempt docs created for this test, incremented
    // in testAttemptController.startTest — same pattern as TestSeries.totalTests.
    attemptsCount: {
      type: Number,
      default: 0,
    },

    sections: {
      type: [sectionSchema],
      default: [],
      validate: [(arr) => arr.length > 0, "At least one section is required"],
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
    this.slug = slugify(this.title);
  }
});

// findByIdAndUpdate/findOneAndUpdate skip pre("save"), so slug would otherwise
// go stale on rename — regenerate it here whenever `title` is part of the update.
testSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const title = update.title ?? update.$set?.title;
  if (!title) return;
  const slug = slugify(title);
  if (update.$set) update.$set.slug = slug;
  else update.slug = slug;
});

export default mongoose.model("Test", testSchema);