const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const router = express.Router();

const EFS_MOUNT_POINT = '/data/efs';
const FALLBACK_DIR = path.join(__dirname, '../uploads');
const upload = multer({ dest: '/tmp/' });

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.access(EFS_MOUNT_POINT);
    console.log('Using EFS mount point:', EFS_MOUNT_POINT);
    return EFS_MOUNT_POINT;
  } catch (error) {
    console.log('EFS not mounted, using fallback directory:', FALLBACK_DIR);
    if (!fsSync.existsSync(FALLBACK_DIR)) {
      await fs.mkdir(FALLBACK_DIR, { recursive: true });
    }
    return FALLBACK_DIR;
  }
}

// Get all images
router.get('/', async (req, res) => {
  try {
    const storageDir = await ensureStorageDir();
    const files = await fs.readdir(storageDir);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );
    
    const imagesWithStats = await Promise.all(
      imageFiles.map(async (file) => {
        try {
          const stats = await fs.stat(path.join(storageDir, file));
          return {
            name: file,
            url: `/efs/image/${file}`,
            uploadDate: stats.mtime
          };
        } catch (error) {
          return {
            name: file,
            url: `/efs/image/${file}`,
            uploadDate: null
          };
        }
      })
    );
    
    res.json(imagesWithStats.sort((a, b) => 
      new Date(b.uploadDate) - new Date(a.uploadDate)
    ));
  } catch (error) {
    console.error('Error reading images:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload image
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('Upload request received:', req.file);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const storageDir = await ensureStorageDir();
    const ext = path.extname(req.file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
    const destPath = path.join(storageDir, filename);
    
    console.log('Moving file from', req.file.path, 'to', destPath);
    
    // Copy file then delete original (works across filesystems)
    await fs.copyFile(req.file.path, destPath);
    await fs.unlink(req.file.path);
    
    console.log('File uploaded successfully:', filename);
    
    res.json({ 
      message: 'Image uploaded successfully',
      filename,
      url: `/efs/image/${filename}`
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    // Clean up temp file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (e) {}
    }
    res.status(500).json({ error: error.message });
  }
});

// Serve image
router.get('/image/:filename', async (req, res) => {
  try {
    const storageDir = await ensureStorageDir();
    const filePath = path.join(storageDir, req.params.filename);
    
    // Check if file exists
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(404).json({ error: 'Image not found' });
  }
});

// Delete image
router.delete('/:filename', async (req, res) => {
  try {
    const storageDir = await ensureStorageDir();
    const filePath = path.join(storageDir, req.params.filename);
    await fs.unlink(filePath);
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
