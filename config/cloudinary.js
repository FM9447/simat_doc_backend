const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists for fallback
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
                              process.env.CLOUDINARY_CLOUD_NAME !== 'Root' &&
                              process.env.CLOUDINARY_API_KEY;

let storage;

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'antigravity_docs',
      allowed_formats: ['jpg', 'png', 'pdf'],
      resource_type: 'auto', // Important for PDF support
    },
  });
} else {
  console.log('--- CLOUDINARY NOT CONFIGURED OR INVALID. USING LOCAL DISK STORAGE FALLBACK ---');
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  });
}

const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };
