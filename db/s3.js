const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../app_config.json');

const s3Client = new S3Client({ region: config.s3.region });

module.exports = { s3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, bucketName: config.s3.bucketName };
