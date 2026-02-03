const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../app_config.json');

const s3Client = new S3Client({ region: config.s3.region });

async function uploadImage(file, productId) {
  try {
    const key = `products/${productId}-${Date.now()}.${file.originalname.split('.').pop()}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    }));

    return key;
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

async function getImageUrl(key) {
  try {
    if (!key) return '';
    const command = new GetObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('Pre-signed URL error:', error);
    return '';
  }
}

async function deleteImage(key) {
  try {
    if (!key) return;
    await s3Client.send(new DeleteObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key
    }));
  } catch (error) {
    console.error('S3 delete error:', error);
  }
}

module.exports = { uploadImage, getImageUrl, deleteImage };
