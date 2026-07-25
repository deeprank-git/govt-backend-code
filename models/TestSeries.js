import mongoose from "mongoose";

const testSeriesSchema = new mongoose.Schema(
  {
    name: {
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

    description: {
      type: String,
      default: "",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    image: {
      type: String,
      default: "",
    },

    notificationPdf: {
      type: String,
      default: "",
    },

    infoPdf: {
      type: String,
      default: "",
    },

    totalTests: {
      type: Number,
      default: 0,
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

    price: {
      type: Number,
      default: 0,
    },

    importantDates: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Mongoose 9: pre("save") no longer receives a next() callback — the first
// arg is a SaveOptions object. Just mutate `this` synchronously; no callback needed.
testSeriesSchema.pre("save", function () {
  if (this.isModified("name")) {
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");
  }
});

export default mongoose.model("TestSeries", testSeriesSchema);