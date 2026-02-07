#!/bin/bash
set -e

# Variables - UPDATE THESE
EFS_ID="fs-0df1a5706ceb8608f"  # Your EFS File System ID
MOUNT_POINT="/data/efs"
AWS_REGION="us-east-1"
DYNAMODB_TABLE="demo_table"
S3_BUCKET="demo-product-images-123456"
RDS_HOST="database-2.cluster-crkedvynyebh.us-east-1.rds.amazonaws.com"
RDS_PORT="5432"
RDS_DATABASE="providers_db"
RDS_USER="dbadmin"
RDS_PASSWORD="YourPassword"
PGPASSWORD=$RDS_PASSWORD

# Update system
dnf update -y

# Install Node.js 22, Git, PostgreSQL, and EFS utilities
dnf install -y nodejs22 git postgresql17 amazon-efs-utils

# Setup EFS mount
echo "Setting up EFS..."
mkdir -p $MOUNT_POINT

# nslookup $EFS_ID.efs.$AWS_REGION.amazonaws.com
# mount -t efs -o tls fs-0df1a5706ceb8608f.efs.us-east-1.amazonaws.com:/ $MOUNT_POINT
# mount -t efs -o tls fs-0df1a5706ceb8608f:/ efs

echo "$EFS_ID.efs.$AWS_REGION.amazonaws.com:/ $MOUNT_POINT efs _netdev,tls,iam 0 0" >> /etc/fstab
mount -a
chmod 777 $MOUNT_POINT

# Clone application from GitHub
cd /home/ec2-user
git clone https://github.com/vietaws/architecting.git
cd architecting

# Run the SQL script
psql -h $RDS_HOST -U $RDS_USER -d $RDS_DATABASE -f setup.sql || true

# Unset password
unset PGPASSWORD

# Create config file
cat > app_config.json <<EOF
{
  "dynamodb": {
    "region": "${AWS_REGION}",
    "tableName": "${DYNAMODB_TABLE}"
  },
  "rds": {
    "host": "${RDS_HOST}",
    "port": ${RDS_PORT},
    "database": "${RDS_DATABASE}",
    "user": "${RDS_USER}",
    "password": "${RDS_PASSWORD}"
  },
  "s3": {
    "region": "${AWS_REGION}",
    "bucketName": "${S3_BUCKET}"
  },
  "server": {
    "port": 3000
  }
}
EOF

# Install dependencies
npm install

# Set ownership
chown -R ec2-user:ec2-user /home/ec2-user/architecting

# Create systemd service
cat > /etc/systemd/system/product-app.service <<'EOFS'
[Unit]
Description=Product Provider Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/architecting
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=product-app

[Install]
WantedBy=multi-user.target
EOFS

# Enable and start service
systemctl daemon-reload
systemctl enable product-app
systemctl start product-app

# Wait for app to start
sleep 5

# Check status
systemctl status product-app --no-pager
