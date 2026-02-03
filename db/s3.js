const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../app_config.json');

const s3Client = new S3Client({ region: config.s3.region });

async function uploadImage(file, productId) {
  const key = `products/${productId}-${Date.now()}.${file.originalname.split('.').pop()}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: config.s3.bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));

  return key;
}

async function getImageUrl(key) {
  if (!key) return '';
  const command = new GetObjectCommand({
    Bucket: config.s3.bucketName,
    Key: key
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

module.exports = { uploadImage, getImageUrl };
