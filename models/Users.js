import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema = new mongoose.Schema(
  {
    // Optional during registration. User can update it later.
    name: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },

    // Optional during registration.
    mobile: {
      type: String,
      trim: true,
      default: "",
    },

    // Optional during registration. User can set it later.
    // sparse:true allows multiple users with no username.
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    profilePicture: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    country: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    password: {
      type: String,
      required: [true, "Password is required"],
    },

    role: {
      type: String,
      enum: ["student", "instructor", "admin"],
      default: "student",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
    },

    // Current-affairs reading streak (see currentAffairsController.js
    // recordCurrentAffairsView / getCurrentAffairsStreak). `lastActiveDate`
    // is date-only, always normalized to midnight UTC — same convention the
    // scrapers use for CurrentAffairs.date.
    currentStreak: {
      type: Number,
      default: 0,
    },

    longestStreak: {
      type: Number,
      default: 0,
    },

    lastActiveDate: {
      type: Date,
      default: null,
    },

    // Password reset fields
    // Stores the hashed reset token only.
    resetPasswordToken: {
      type: String,
      select: false,
    },

    resetPasswordExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically hash password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);

export default User;