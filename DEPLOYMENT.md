# Deployment Guide: Product-Provider Management Application

## Step 1: Prepare GitHub Repository

### 1.1 Initialize Git (if not already done)
```bash
cd /Users/thudao/vietdata/udemy/architecting
git init
```

### 1.2 Add files and commit
```bash
git add .
git commit -m "Initial commit: Product-Provider Management App"
```

### 1.3 Create GitHub repository and push
```bash
# Create repo on GitHub: https://github.com/new
# Repository name: architecting
# Make it public or private (ensure EC2 can access)

git remote add origin https://github.com/vietaws/architecting.git
git branch -M main
git push -u origin main
```

## Step 2: AWS Infrastructure Setup

### 2.1 Create DynamoDB Table
```bash
aws dynamodb create-table \
  --table-name demo_table \
  --attribute-definitions AttributeName=product_id,AttributeType=S \
  --key-schema AttributeName=product_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### 2.2 Create S3 Bucket
```bash
aws s3 mb s3://demo-product-images-bucket-$(date +%s) --region us-east-1
# Note the bucket name for later
```

### 2.3 Create RDS PostgreSQL (if not exists)
```bash
aws rds create-db-instance \
  --db-instance-identifier product-provider-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password YourSecurePassword123 \
  --allocated-storage 20 \
  --publicly-accessible \
  --region us-east-1
```

Wait for RDS to be available, then run setup.sql:
```bash
psql -h <RDS-ENDPOINT> -U admin -d postgres -f setup.sql
```

### 2.4 Create IAM Role for EC2
```bash
# Create trust policy
cat > ec2-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name ProductAppEC2Role \
  --assume-role-policy-document file://ec2-trust-policy.json

# Attach policies
aws iam attach-role-policy \
  --role-name ProductAppEC2Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

aws iam attach-role-policy \
  --role-name ProductAppEC2Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name ProductAppEC2Profile

aws iam add-role-to-instance-profile \
  --instance-profile-name ProductAppEC2Profile \
  --role-name ProductAppEC2Role
```

## Step 3: Create Launch Template with User Data

### 3.1 Prepare user data with your actual values
Edit `userdata.sh` and replace environment variables, or use this command to create a configured version:

```bash
cat > userdata-configured.sh <<'EOF'
#!/bin/bash
set -e

# Set environment variables (REPLACE WITH YOUR VALUES)
export AWS_REGION="us-east-1"
export DYNAMODB_TABLE="demo_table"
export S3_BUCKET="demo-product-images-bucket-123456"
export RDS_HOST="product-provider-db.xxxxx.us-east-1.rds.amazonaws.com"
export RDS_PORT="5432"
export RDS_DATABASE="products_db"
export RDS_USER="admin"
export RDS_PASSWORD="YourSecurePassword123"

# Update system
yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs git

# Install PM2 globally
npm install -g pm2

# Clone application from GitHub
cd /home/ec2-user
git clone https://github.com/vietaws/architecting.git
cd architecting

# Create config file
cat > app_config.json <<EOFCONFIG
{
  "region": "${AWS_REGION}",
  "dynamodb_table": "${DYNAMODB_TABLE}",
  "s3_bucket": "${S3_BUCKET}",
  "rds": {
    "host": "${RDS_HOST}",
    "port": ${RDS_PORT},
    "database": "${RDS_DATABASE}",
    "user": "${RDS_USER}",
    "password": "${RDS_PASSWORD}"
  },
  "server_port": 3000
}
EOFCONFIG

# Install dependencies
npm install

# Start application with PM2
pm2 start server.js --name product-app
pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Set ownership
chown -R ec2-user:ec2-user /home/ec2-user/architecting
EOF
```

### 3.2 Create Security Group
```bash
aws ec2 create-security-group \
  --group-name product-app-sg \
  --description "Security group for Product Provider App" \
  --region us-east-1

# Get the security group ID from output, then:
SG_ID="sg-xxxxxxxxx"

# Allow HTTP traffic on port 3000
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0

# Allow SSH
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0
```

### 3.3 Create Launch Template
```bash
# Base64 encode user data
USER_DATA=$(base64 -i userdata-configured.sh)

aws ec2 create-launch-template \
  --launch-template-name product-app-template \
  --version-description "v1" \
  --launch-template-data "{
    \"ImageId\": \"ami-0c02fb55b34e3f5e6\",
    \"InstanceType\": \"t3.micro\",
    \"IamInstanceProfile\": {\"Name\": \"ProductAppEC2Profile\"},
    \"SecurityGroupIds\": [\"$SG_ID\"],
    \"UserData\": \"$USER_DATA\"
  }" \
  --region us-east-1
```

## Step 4: Launch EC2 Instance (Single Instance Test)

```bash
aws ec2 run-instances \
  --launch-template LaunchTemplateName=product-app-template \
  --region us-east-1
```

Get the public IP and test:
```bash
# Wait 3-5 minutes for setup to complete
curl http://<EC2-PUBLIC-IP>:3000
```

## Step 5: Setup Auto Scaling (Optional)

### 5.1 Create Target Group
```bash
aws elbv2 create-target-group \
  --name product-app-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxxxxx \
  --health-check-path /health \
  --region us-east-1
```

### 5.2 Create Application Load Balancer
```bash
aws elbv2 create-load-balancer \
  --name product-app-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups $SG_ID \
  --region us-east-1

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn <ALB-ARN> \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=<TG-ARN>
```

### 5.3 Create Auto Scaling Group
```bash
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name product-app-asg \
  --launch-template LaunchTemplateName=product-app-template \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 2 \
  --target-group-arns <TG-ARN> \
  --vpc-zone-identifier "subnet-xxxxx,subnet-yyyyy" \
  --health-check-type ELB \
  --health-check-grace-period 300 \
  --region us-east-1

# Add scaling policy
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name product-app-asg \
  --policy-name cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration file://scaling-policy.json
```

Create `scaling-policy.json`:
```json
{
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ASGAverageCPUUtilization"
  },
  "TargetValue": 70.0
}
```

## Step 6: Verify Deployment

### 6.1 Check EC2 instance logs
```bash
ssh -i your-key.pem ec2-user@<EC2-IP>
sudo tail -f /var/log/cloud-init-output.log
pm2 logs product-app
```

### 6.2 Test API endpoints
```bash
# Health check
curl http://<ALB-DNS-OR-EC2-IP>:3000/health

# Create product
curl -X POST http://<ALB-DNS-OR-EC2-IP>:3000/products \
  -H "Content-Type: application/json" \
  -d '{"product_id":"P001","name":"Test Product","price":99.99}'

# List products
curl http://<ALB-DNS-OR-EC2-IP>:3000/products
```

## Troubleshooting

**Application not starting:**
- Check user data logs: `sudo cat /var/log/cloud-init-output.log`
- Verify IAM role permissions
- Check security group allows port 3000

**Database connection errors:**
- Verify RDS security group allows EC2 security group
- Check RDS endpoint and credentials in app_config.json
- Ensure RDS is publicly accessible or in same VPC

**GitHub clone fails:**
- For private repos, use GitHub token or SSH keys
- Add to user data: `git clone https://TOKEN@github.com/vietaws/architecting.git`

## Security Best Practices

1. **Use AWS Systems Manager Parameter Store for secrets:**
```bash
aws ssm put-parameter \
  --name /product-app/rds-password \
  --value "YourSecurePassword123" \
  --type SecureString

# Modify user data to fetch from SSM
RDS_PASSWORD=$(aws ssm get-parameter --name /product-app/rds-password --with-decryption --query Parameter.Value --output text)
```

2. **Restrict security groups** - Only allow ALB to access EC2 port 3000
3. **Use private subnets** for EC2 instances
4. **Enable RDS encryption** at rest
5. **Use S3 bucket policies** to restrict access

## Cleanup

```bash
# Delete Auto Scaling Group
aws autoscaling delete-auto-scaling-group \
  --auto-scaling-group-name product-app-asg \
  --force-delete

# Delete Load Balancer
aws elbv2 delete-load-balancer --load-balancer-arn <ALB-ARN>
aws elbv2 delete-target-group --target-group-arn <TG-ARN>

# Terminate EC2 instances
aws ec2 terminate-instances --instance-ids <INSTANCE-ID>

# Delete Launch Template
aws ec2 delete-launch-template --launch-template-name product-app-template

# Delete RDS
aws rds delete-db-instance \
  --db-instance-identifier product-provider-db \
  --skip-final-snapshot

# Delete DynamoDB table
aws dynamodb delete-table --table-name demo_table

# Delete S3 bucket
aws s3 rb s3://demo-product-images-bucket-123456 --force
```
