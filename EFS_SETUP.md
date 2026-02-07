# EFS Image Gallery Feature - Implementation Guide

## Overview
Added EFS (Elastic File System) integration for shared image storage across multiple EC2 instances.

## Architecture
- **EFS Mount Point**: `/data/efs`
- **Auto-mount**: Configured in `/etc/fstab`
- **Features**: Upload, view, delete images
- **Responsive**: Desktop and mobile support

## Step-by-Step Implementation

### Step 1: Create EFS File System

```bash
# Create EFS
aws efs create-file-system \
  --performance-mode generalPurpose \
  --throughput-mode bursting \
  --encrypted \
  --tags Key=Name,Value=product-app-efs Key=project,Value=miracle \
  --region us-east-1

# Note the FileSystemId (fs-xxxxxxxxx)
```

### Step 2: Create EFS Mount Targets

```bash
# Get your VPC subnets
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=<YOUR-VPC-ID>" \
  --query 'Subnets[*].[SubnetId,AvailabilityZone]' \
  --output table

# Create mount target in each AZ (for high availability)
aws efs create-mount-target \
  --file-system-id fs-xxxxxxxxx \
  --subnet-id subnet-xxxxx \
  --security-groups sg-xxxxx \
  --region us-east-1

# Repeat for other subnets/AZs
```

### Step 3: Configure EFS Security Group

```bash
# Get EC2 security group ID
EC2_SG="sg-xxxxx"

# Get EFS security group ID (from mount target)
EFS_SG=$(aws efs describe-mount-targets \
  --file-system-id fs-xxxxxxxxx \
  --query 'MountTargets[0].SecurityGroups[0]' \
  --output text)

# Allow NFS traffic from EC2 to EFS
aws ec2 authorize-security-group-ingress \
  --group-id $EFS_SG \
  --protocol tcp \
  --port 2049 \
  --source-group $EC2_SG
```

### Step 4: Update IAM Role for EC2

Add EFS permissions to your EC2 IAM role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticfilesystem:ClientMount",
        "elasticfilesystem:ClientWrite",
        "elasticfilesystem:DescribeFileSystems"
      ],
      "Resource": "arn:aws:elasticfilesystem:us-east-1:*:file-system/fs-xxxxxxxxx"
    }
  ]
}
```

### Step 5: Update User Data Script

Update `userdata-systemd.sh` with your EFS ID:

```bash
# Edit the EFS_ID variable
EFS_ID="fs-xxxxxxxxx"  # Replace with your actual EFS ID
```

### Step 6: Deploy Application

**Option A: New EC2 Instance**
```bash
# Use updated userdata-systemd.sh in Launch Template
# EFS will be mounted automatically on boot
```

**Option B: Existing EC2 Instance**
```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2-IP>

# Run EFS setup script
sudo bash /home/ec2-user/architecting/setup-efs.sh

# Update application code
cd /home/ec2-user/architecting
git pull origin main
npm install

# Restart application
sudo systemctl restart product-app
```

### Step 7: Verify EFS Mount

```bash
# Check if EFS is mounted
df -h | grep /data/efs

# Check mount point permissions
ls -la /data/efs

# Test write access
sudo touch /data/efs/test.txt
ls -la /data/efs/test.txt
```

## Features

### 1. Upload Images
- Click "Upload Image" button
- Select image file (jpg, jpeg, png, gif, webp)
- Image is stored in EFS at `/data/efs`
- Accessible from all EC2 instances

### 2. View Images
- Grid layout showing all images
- Responsive design (desktop: 4 columns, mobile: 2 columns)
- Lazy loading for performance
- Images served directly from EFS

### 3. Delete Images
- Click trash icon on any image
- Confirmation dialog
- Image deleted from EFS

## API Endpoints

### Get All Images
```bash
GET /efs
Response: [
  {
    "name": "1738934567890-abc123.jpg",
    "url": "/efs/image/1738934567890-abc123.jpg",
    "uploadDate": "2026-02-07T02:30:00.000Z"
  }
]
```

### Upload Image
```bash
POST /efs/upload
Content-Type: multipart/form-data
Body: image file

Response: {
  "message": "Image uploaded successfully",
  "filename": "1738934567890-abc123.jpg",
  "url": "/efs/image/1738934567890-abc123.jpg"
}
```

### Get Image
```bash
GET /efs/image/:filename
Response: Image file (binary)
```

### Delete Image
```bash
DELETE /efs/:filename
Response: {
  "message": "Image deleted successfully"
}
```

## Files Created/Modified

### New Files:
1. `routes/efs.js` - EFS API routes
2. `setup-efs.sh` - Standalone EFS setup script

### Modified Files:
1. `server.js` - Added EFS routes
2. `public/index.html` - Added EFS Images tab and gallery
3. `public/app.js` - Added EFS functions
4. `public/style.css` - Added EFS gallery styles
5. `userdata-systemd.sh` - Added EFS mount setup

## Benefits

### 1. Shared Storage
- All EC2 instances access same images
- No need to sync between instances
- Perfect for Auto Scaling Groups

### 2. Persistent Storage
- Images survive instance termination
- Data persists across deployments
- Automatic backups available

### 3. Scalable
- Grows automatically with usage
- No capacity planning needed
- Pay only for storage used

### 4. High Availability
- Multi-AZ by default
- Automatic failover
- 99.99% availability SLA

## Troubleshooting

### EFS Not Mounting
```bash
# Check EFS mount targets
aws efs describe-mount-targets --file-system-id fs-xxxxxxxxx

# Check security group rules
aws ec2 describe-security-groups --group-ids <EFS-SG-ID>

# Check mount manually
sudo mount -t efs -o tls,iam fs-xxxxxxxxx:/ /data/efs
```

### Permission Denied
```bash
# Fix permissions
sudo chmod 777 /data/efs

# Check ownership
ls -la /data/efs
```

### Images Not Loading
```bash
# Check EFS mount
df -h | grep /data/efs

# Check files exist
ls -la /data/efs

# Check application logs
sudo journalctl -u product-app -f
```

### Upload Fails
```bash
# Check /tmp directory permissions
ls -la /tmp

# Check disk space
df -h

# Check application logs
sudo journalctl -u product-app -n 50
```

## Cost Estimation

**EFS Pricing (us-east-1):**
- Standard Storage: $0.30/GB-month
- Infrequent Access: $0.025/GB-month
- Data Transfer: Free within same AZ

**Example:**
- 10 GB images = ~$3/month
- 100 GB images = ~$30/month

## Security Best Practices

1. **Encryption**: Enable encryption at rest (done by default)
2. **IAM**: Use IAM authorization for mount (configured in fstab)
3. **Security Groups**: Restrict NFS access to EC2 instances only
4. **File Permissions**: Set appropriate permissions (777 for demo, 755 for production)

## Testing

### Test Upload
```bash
# From browser
1. Go to EFS Images tab
2. Click "Upload Image"
3. Select an image
4. Verify it appears in gallery

# From CLI
curl -X POST http://<EC2-IP>:3000/efs/upload \
  -F "image=@test.jpg"
```

### Test Multi-Instance Access
```bash
# Upload from Instance 1
# View from Instance 2 (behind ALB)
# Both should see same images
```

### Test Auto-Mount After Reboot
```bash
# Reboot EC2
sudo reboot

# After reboot, check mount
df -h | grep /data/efs

# Check images still accessible
curl http://localhost:3000/efs
```

## Next Steps

1. **Create EFS** with the commands above
2. **Update userdata-systemd.sh** with your EFS ID
3. **Deploy to EC2** instances
4. **Test upload/delete** functionality
5. **Verify multi-instance** access through ALB

## Monitoring

```bash
# Check EFS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EFS \
  --metric-name DataReadIOBytes \
  --dimensions Name=FileSystemId,Value=fs-xxxxxxxxx \
  --start-time 2026-02-07T00:00:00Z \
  --end-time 2026-02-07T23:59:59Z \
  --period 3600 \
  --statistics Sum
```
