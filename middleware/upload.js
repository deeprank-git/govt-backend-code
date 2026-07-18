// middleware/upload.js
//
// Local disk storage via Multer, as scoped in the original doc
// ("File Storage — Local server storage using Multer (free)").
// Files land in /uploads at the project root, served statically by
// index.js at the `/uploads` path. Swapping this for Cloudinary later
// only means changing this one file — controllers just consume
// `req.file` and don't care where it physically ends up.

import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Make sure the folder exists — a fresh clone won't have it, and
// multer.diskStorage doesn't create directories for you.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "application/pdf"];

const fileFilter = (req, file, cb) => {
  const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix));
  if (!isAllowed) {
    return cb(new Error("Unsupported file type. Only images, videos, and PDFs are allowed."));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export { UPLOAD_DIR };
export default upload;
