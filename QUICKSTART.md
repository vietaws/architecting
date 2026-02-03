# Quick Start Guide

## 1. Push to GitHub (5 minutes)

```bash
cd /Users/thudao/vietdata/udemy/architecting

# Initialize and commit
git init
git add .
git commit -m "Initial commit"

# Create repo at: https://github.com/new (name: architecting)
git remote add origin https://github.com/vietaws/architecting.git
git branch -M main
git push -u origin main
```

## 2. Create AWS Resources (10 minutes)

```bash
# DynamoDB
aws dynamodb create-table \
  --table-name demo_table \
  --attribute-definitions AttributeName=product_id,AttributeType=S \
  --key-schema AttributeName=product_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# S3 Bucket
aws s3 mb s3://demo-product-images-$(date +%s)

# IAM Role
aws iam create-role \
  --role-name ProductAppEC2Role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy \
  --role-name ProductAppEC2Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

aws iam attach-role-policy \
  --role-name ProductAppEC2Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

aws iam create-instance-profile --instance-profile-name ProductAppEC2Profile
aws iam add-role-to-instance-profile \
  --instance-profile-name ProductAppEC2Profile \
  --role-name ProductAppEC2Role
```

## 3. Launch EC2 with User Data (2 minutes)

**Option A: Using AWS Console**
1. Go to EC2 → Launch Instance
2. Name: `product-app-server`
3. AMI: Amazon Linux 2023
4. Instance type: t3.micro
5. Key pair: Select or create
6. Security group: Allow ports 22, 3000
7. IAM role: `ProductAppEC2Profile`
8. Advanced → User data: Copy content from `userdata.sh` and replace these values:
   ```bash
   export AWS_REGION="us-east-1"
   export DYNAMODB_TABLE="demo_table"
   export S3_BUCKET="your-bucket-name"
   export RDS_HOST="your-rds-endpoint.rds.amazonaws.com"
   export RDS_PORT="5432"
   export RDS_DATABASE="products_db"
   export RDS_USER="admin"
   export RDS_PASSWORD="your-password"
   ```
   Then paste the rest of userdata.sh
9. Launch

**Option B: Using AWS CLI**
```bash
# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name product-app-sg \
  --description "Product App" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0

# Create userdata file with your values
cat > userdata-final.sh <<'USERDATA'
#!/bin/bash
set -e
export AWS_REGION="us-east-1"
export DYNAMODB_TABLE="demo_table"
export S3_BUCKET="demo-product-images-123456"
export RDS_HOST="your-db.rds.amazonaws.com"
export RDS_PORT="5432"
export RDS_DATABASE="products_db"
export RDS_USER="admin"
export RDS_PASSWORD="YourPassword"

yum update -y
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs git
npm install -g pm2

cd /home/ec2-user
git clone https://github.com/vietaws/architecting.git
cd architecting

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

npm install
pm2 start server.js --name product-app
pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save
chown -R ec2-user:ec2-user /home/ec2-user/architecting
USERDATA

# Launch instance
aws ec2 run-instances \
  --image-id ami-0c02fb55b34e3f5e6 \
  --instance-type t3.micro \
  --key-name your-key-name \
  --security-group-ids $SG_ID \
  --iam-instance-profile Name=ProductAppEC2Profile \
  --user-data file://userdata-final.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=product-app-server}]'
```

## 4. Test (5 minutes)

Wait 3-5 minutes for setup, then:

```bash
# Get instance IP
INSTANCE_IP=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=product-app-server" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

# Test health
curl http://$INSTANCE_IP:3000/health

# Test API
curl -X POST http://$INSTANCE_IP:3000/products \
  -H "Content-Type: application/json" \
  -d '{"product_id":"P001","name":"Test Product","price":99.99}'

curl http://$INSTANCE_IP:3000/products
```

## Troubleshooting

**Check logs:**
```bash
ssh -i your-key.pem ec2-user@$INSTANCE_IP
sudo tail -f /var/log/cloud-init-output.log
pm2 logs product-app
```

**Common issues:**
- Wait 5 minutes for full setup
- Verify security group allows port 3000
- Check IAM role is attached
- Ensure RDS endpoint is correct and accessible

## Next Steps

See `DEPLOYMENT.md` for:
- Auto Scaling setup
- Load Balancer configuration
- Production security hardening
- SSM Parameter Store for secrets
