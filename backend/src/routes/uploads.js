const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST /api/uploads
// body: { image: "data:image/jpeg;base64,..." }
// returns: { url: "https://res.cloudinary.com/..." }
router.post('/', auth, async (req, res, next) => {
  try {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image')) {
      return res.status(400).json({ error: 'ต้องส่งข้อมูลรูปภาพ (base64)' });
    }

    const result = await cloudinary.uploader.upload(image, {
      folder: 'pos-products',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'center' },
        { quality: 'auto:good', fetch_format: 'auto' },
      ],
    });

    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
