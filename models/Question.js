// models/Question.js

import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
});

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
    },

    options: {
      type: [optionSchema],
      validate: [arr => arr.length === 4, "Must have exactly 4 options"],
    },

    correctAnswer: {
      type: Number, // index (0–3)
      required: true,
    },

    explanation: {
      type: String,
      default: "",
    },

    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },

    // References a Test.sections[]._id subdocument, not a top-level
    // collection — validated in the controller against the Test's own
    // sections array rather than via a Mongoose `ref`.
    section: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    marks: {
      type: Number,
      default: 1,
    },

    order: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Question", questionSchema);