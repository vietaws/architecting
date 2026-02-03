#!/bin/bash
set -e
export AWS_REGION="us-east-1"
export DYNAMODB_TABLE="demo_table"
export S3_BUCKET="demo-product-images-123456"
export RDS_HOST="database-1.cluster-crkedvynyebh.us-east-1.rds.amazonaws.com"
export RDS_PORT="5432"
export RDS_DATABASE="products_db"
export RDS_USER="dbadmin"
export RDS_PASSWORD="YourPassword"
export PGPASSWORD=$RDS_PASSWORD

# Update system
yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs git
yum install -y postgresql17

# Install PM2 globally
npm install -g pm2

# Clone application from GitHub
cd /home/ec2-user
git clone https://github.com/vietaws/architecting.git
cd architecting

# Run the SQL script
psql -h $RDS_HOST -U $RDS_USER -d products_db -f setup.sql

# Unset password
unset PGPASSWORD

# Create config file from environment variables
cat > app_config.json <<EOF
{
  "dynamodb": {
    "region": "${AWS_REGION:-us-east-1}",
    "tableName": "${DYNAMODB_TABLE:-demo_table}"
  },
  "rds": {
    "host": "${RDS_HOST}",
    "port": ${RDS_PORT:-5432},
    "database": "${RDS_DATABASE:-products_db}",
    "user": "${RDS_USER:-admin}",
    "password": "${RDS_PASSWORD}"
  },
  "s3": {
    "region": "${S3_REGION:-us-east-1}",
    "bucketName": "${S3_BUCKET:-demo_product_images_bucket}"
  },
  "server": {
    "port": 3000
  }
}
EOF

# Install dependencies
npm install

# Start application with PM2
pm2 start server.js --name product-app
pm2 startup systemd -u ec2-user --hp /home/ec2-user
env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Set ownership
chown -R ec2-user:ec2-user /home/ec2-user/architecting

# check logs
# pm2 logs product-app --lines 50