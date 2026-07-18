// models/Setting.js
//
// Site-wide settings. This is a singleton — there is only ever meant to
// be one Setting document. getOrCreate() below is how every controller
// should fetch it, so we never end up with two competing "the" settings
// rows.

import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: "GovtPrep",
    },

    logo: {
      type: String,
      default: "",
    },

    contactEmail: {
      type: String,
      default: "",
    },

    socialLinks: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    maintenanceMode: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

settingSchema.statics.getOrCreate = async function () {
  let setting = await this.findOne();
  if (!setting) {
    setting = await this.create({});
  }
  return setting;
};

export default mongoose.model("Setting", settingSchema);
