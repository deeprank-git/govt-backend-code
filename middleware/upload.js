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

// Each fieldname maps 1:1 to a single upload site in the app, so routing by
// fieldname alone is unambiguous — no need to sniff other body fields.
// Fieldnames not listed here (profilePicture, the generic Media `file`
// field) keep landing in the flat UPLOAD_DIR root.
const SUBFOLDER_BY_FIELDNAME = {
  image: "testseries_image",
  notificationPdf: "notificationPDF",
  categoryImage: "category_image",
  currentAffairsImage: "current_affairs_image",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = SUBFOLDER_BY_FIELDNAME[file.fieldname];
    const dir = subdir ? path.join(UPLOAD_DIR, subdir) : UPLOAD_DIR;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Prefer the entity the file belongs to (a TestSeries id known via the
    // route param on update, or pre-generated on create — see
    // testSeriesAdminRoutes.js) over the uploader, so files are named after
    // what they're attached to rather than who uploaded them.
    const entityId = req.uploadEntityId ?? req.params?.id ?? req.user?._id ?? "anon";
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${entityId}-${uniqueSuffix}${ext}`);
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

// Builds the public /uploads/... URL from where the file actually landed on
// disk, so it's always correct regardless of SUBFOLDER_BY_FIELDNAME — callers
// never need to know or duplicate the subfolder mapping themselves.
export const toUploadUrl = (file) =>
  "/uploads/" + path.relative(UPLOAD_DIR, file.path).split(path.sep).join("/");

export { UPLOAD_DIR };
export default upload;
