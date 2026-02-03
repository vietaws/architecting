# Troubleshooting Image Upload 500 Error

## Common Issues & Fixes

### 1. Check EC2 IAM Role Permissions
Ensure your EC2 instance has S3 permissions:

```bash
# Verify IAM role is attached
aws ec2 describe-instances --instance-ids <INSTANCE-ID> \
  --query 'Reservations[0].Instances[0].IamInstanceProfile'

# The role should have AmazonS3FullAccess or these permissions:
# - s3:PutObject
# - s3:GetObject
```

### 2. Verify S3 Bucket Exists
```bash
aws s3 ls s3://demo-product-images-123456/
```

If bucket doesn't exist:
```bash
aws s3 mb s3://demo-product-images-123456
```

### 3. Check Application Logs
```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2-IP>

# Check PM2 logs
pm2 logs product-app

# Check for specific errors
pm2 logs product-app --err
```

### 4. Test S3 Upload from EC2
```bash
# SSH to EC2 and test S3 access
echo "test" > test.txt
aws s3 cp test.txt s3://demo-product-images-123456/test.txt

# If this fails, IAM role is not configured correctly
```

### 5. Verify Dependencies Installed
```bash
# SSH to EC2
cd /home/ec2-user/architecting
npm install
pm2 restart product-app
```

### 6. Check ALB Health Check
```bash
# Test health endpoint
curl http://<ALB-DNS>/health

# Test direct to EC2
curl http://<EC2-IP>:3000/health
```

### 7. Test Product Creation Without Image
```bash
curl -X POST http://<EC2-IP>:3000/products \
  -F "product_id=TEST001" \
  -F "product_name=Test Product" \
  -F "description=Test" \
  -F "price=99.99" \
  -F "remaining_sku=10"
```

### 8. Test Product Creation With Image
```bash
curl -X POST http://<EC2-IP>:3000/products \
  -F "product_id=TEST002" \
  -F "product_name=Test Product 2" \
  -F "description=Test" \
  -F "price=99.99" \
  -F "remaining_sku=10" \
  -F "image=@/path/to/test-image.jpg"
```

## Quick Fix Checklist

1. ✅ Restart application: `pm2 restart product-app`
2. ✅ Install dependencies: `npm install`
3. ✅ Check IAM role has S3 permissions
4. ✅ Verify bucket name in `app_config.json` matches actual bucket
5. ✅ Check EC2 security group allows port 3000
6. ✅ Review PM2 logs for specific error messages

## Updated Code Changes

The following fixes were applied:
- Added error handler middleware in `server.js`
- Added validation for required fields
- Added detailed error logging
- Added try-catch blocks with specific error messages
- Handle missing/empty values gracefully
