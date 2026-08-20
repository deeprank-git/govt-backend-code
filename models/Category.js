import mongoose from "mongoose";
import { slugify } from "../utils/slugify.js";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    slug: {
      type: String,
      // required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    image: {
      type: String, // URL or file path
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
  }
);

// Mongoose 9: pre("save") no longer receives a next() callback — the first
// arg is a SaveOptions object. Just mutate `this` synchronously; no callback needed.
categorySchema.pre("save", function () {
  if (this.isModified("name")) {
    this.slug = slugify(this.name);
  }
});

// findByIdAndUpdate/findOneAndUpdate skip pre("save"), so slug would otherwise
// go stale on rename — regenerate it here whenever `name` is part of the update.
categorySchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const name = update.name ?? update.$set?.name;
  if (!name) return;
  const slug = slugify(name);
  if (update.$set) update.$set.slug = slug;
  else update.slug = slug;
});

const Category=mongoose.model('Category',categorySchema);
export default Category;