// controllers/settingController.js

import Setting from "../models/Setting.js";

// ✅ GET /api/settings — public, frontend needs this before login even happens
// (site name, logo, maintenance banner, etc.)
export const getSettings = async (req, res) => {
  try {
    const settings = await Setting.getOrCreate();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching settings",
      error: error.message,
    });
  }
};

// ✅ PUT /api/admin/settings — upsert the single settings document
export const updateSettings = async (req, res) => {
  try {
    const settings = await Setting.getOrCreate();

    const { siteName, logo, contactEmail, socialLinks, maintenanceMode } = req.body;

    if (siteName !== undefined) settings.siteName = siteName;
    if (logo !== undefined) settings.logo = logo;
    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (socialLinks !== undefined) settings.socialLinks = socialLinks;
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;

    await settings.save();

    res.status(200).json({ success: true, message: "Settings updated", data: settings });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating settings",
      error: error.message,
    });
  }
};
