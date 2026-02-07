const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const EFS_MOUNT_POINT = '/data/efs';
const upload = multer({ dest: '/tmp/' });

// Get all images
router.get('/', async (req, res) => {
  try {
    const files = await fs.readdir(EFS_MOUNT_POINT);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );
    
    const images = imageFiles.map(file => ({
      name: file,
      url: `/efs/image/${file}`,
      uploadDate: null
    }));
    
    // Get file stats for upload date
    const imagesWithStats = await Promise.all(
      images.map(async (img) => {
        try {
          const stats = await fs.stat(path.join(EFS_MOUNT_POINT, img.name));
          return { ...img, uploadDate: stats.mtime };
        } catch (error) {
          return img;
        }
      })
    );
    
    res.json(imagesWithStats.sort((a, b) => 
      new Date(b.uploadDate) - new Date(a.uploadDate)
    ));
  } catch (error) {
    console.error('Error reading EFS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload image
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const ext = path.extname(req.file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
    const destPath = path.join(EFS_MOUNT_POINT, filename);
    
    await fs.rename(req.file.path, destPath);
    
    res.json({ 
      message: 'Image uploaded successfully',
      filename,
      url: `/efs/image/${filename}`
    });
  } catch (error) {
    console.error('Error uploading to EFS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve image
router.get('/image/:filename', async (req, res) => {
  try {
    const filePath = path.join(EFS_MOUNT_POINT, req.params.filename);
    res.sendFile(filePath);
  } catch (error) {
    res.status(404).json({ error: 'Image not found' });
  }
});

// Delete image
router.delete('/:filename', async (req, res) => {
  try {
    const filePath = path.join(EFS_MOUNT_POINT, req.params.filename);
    await fs.unlink(filePath);
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting from EFS:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
