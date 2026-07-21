// middleware/uploadCsv.js
//
// Separate Multer instance for the bulk-question CSV upload. Distinct from
// middleware/upload.js (which is scoped to image/video/pdf and persists to
// disk) — a bulk-upload CSV is parsed once on request and never needs to be
// kept around, so this uses memory storage instead.

import multer from "multer";

const ALLOWED_MIME_TYPES = ["text/csv", "application/vnd.ms-excel", "application/csv"];

const fileFilter = (req, file, cb) => {
  const isCsvMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const isCsvExt = file.originalname.toLowerCase().endsWith(".csv");
  if (!isCsvMime && !isCsvExt) {
    return cb(new Error("Only CSV files are allowed."));
  }
  cb(null, true);
};

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export default uploadCsv;
