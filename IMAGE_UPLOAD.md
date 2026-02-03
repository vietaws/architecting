# Image Upload Feature Setup

## Changes Made

1. **Backend**: Uses pre-signed URLs for private S3 access
2. **Frontend**: File upload with automatic secure URL generation
3. **S3 Integration**: Images stored privately in `demo-product-images-123456` bucket

## Installation

```bash
npm install
```

## S3 Bucket Configuration

**No public access needed!** Keep your bucket private:

```bash
# Ensure bucket is private (default)
aws s3api put-public-access-block \
  --bucket demo-product-images-123456 \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

## How It Works

1. **Upload**: Image file is uploaded to S3 with private access
2. **Storage**: Only the S3 key (path) is stored in DynamoDB as `image_key`
3. **Retrieval**: When products are fetched, pre-signed URLs are generated on-the-fly
4. **Access**: Pre-signed URLs expire after 1 hour (3600 seconds)

## Usage

1. Start the application: `npm start`
2. Go to `http://localhost:3000`
3. Click "Add Product"
4. Fill in product details and select an image file
5. Click "Save"
6. Image will be uploaded to private S3 and displayed via pre-signed URL

## Image Storage Format

- **S3 Key**: `products/{product_id}-{timestamp}.{extension}`
- **DynamoDB**: Stores only the key, not the full URL
- **Display**: Pre-signed URL generated with 1-hour expiration

## Security Benefits

- S3 bucket remains completely private
- No public access policies needed
- Temporary URLs expire automatically
- IAM permissions control access
