import mongoose from "mongoose";

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

    sections: {
      type: [sectionSchema],
      default: [],
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