// controllers/mediaController.js

import fs from "fs";
import Media from "../models/Media.js";
import { toUploadUrl } from "../middleware/upload.js";

// helper: guess our simplified `type` enum from the mime type
const resolveType = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
};

// ✅ POST /api/admin/media/upload — single file, field name "file"
export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { usedInRefType, usedInRefId } = req.body;

    const media = await Media.create({
      url: toUploadUrl(req.file),
      filePath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      type: resolveType(req.file.mimetype),
      uploadedBy: req.user.id,
      usedInRefType: usedInRefType || null,
      usedInRefId: usedInRefId || null,
    });

    res.status(201).json({ success: true, message: "File uploaded", data: media });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error uploading file",
      error: error.message,
    });
  }
};

// ✅ GET /api/admin/media?type=&usedInRefType=
export const getMedia = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.usedInRefType) filter.usedInRefType = req.query.usedInRefType;

    const media = await Media.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: media.length, data: media });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching media",
      error: error.message,
    });
  }
};

// ✅ DELETE /api/admin/media/:id
// Real delete (not soft) — an orphaned file on disk that nothing links
// to any more has no reason to hang around, unlike content records
// elsewhere in the app.
export const deleteMedia = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }

    // best-effort disk cleanup — a missing file shouldn't block removing the record
    fs.unlink(media.filePath, () => {});

    await media.deleteOne();

    res.status(200).json({ success: true, message: "Media deleted" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting media",
      error: error.message,
    });
  }
};
