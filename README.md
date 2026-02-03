# Product-Provider Management Application

## Architecture
- **Application Tier**: Node.js on EC2 with Auto Scaling
- **Load Balancer**: Application Load Balancer (ALB)
- **Databases**: DynamoDB (products) + RDS PostgreSQL (providers)
- **Storage**: S3 (product images)

## Setup Instructions

### 1. Prerequisites
- EC2 instance with Node.js installed
- IAM role attached to EC2 with policies:
  - `AmazonDynamoDBFullAccess`
  - `AmazonS3FullAccess`

### 2. Database Setup

**DynamoDB Table:**
```bash
aws dynamodb create-table \
  --table-name demo_table \
  --attribute-definitions AttributeName=product_id,AttributeType=S \
  --key-schema AttributeName=product_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

**RDS PostgreSQL:**
Connect to your RDS instance and run:
```bash
psql -h db.viet.vn -U admin -d products_db -f setup.sql
```

**S3 Bucket:**
```bash
aws s3 mb s3://demo_product_images_bucket
```

### 3. Application Deployment

Update `app_config.json` with your actual credentials and endpoints.

Install dependencies and start:
```bash
npm install
npm start
```

Access the web interface at: `http://<EC2-Public-IP>:3000`

### 4. Auto Scaling Configuration

Create Launch Template with:
- AMI with Node.js and application code
- IAM role with DynamoDB and S3 permissions
- User data script to start application

Create Auto Scaling Group:
- Min: 2, Max: 10, Desired: 2
- Target tracking policy (CPU 70%)
- Attach to ALB target group

### 5. ALB Setup

- Create ALB with target group (port 3000)
- Health check: `/health`
- Register Auto Scaling Group

### 6. EC2 Security Group

Ensure your EC2 security group allows:
- Port 3000 (from ALB or 0.0.0.0/0 for testing)
- Port 22 (SSH for management)

### 7. Quick Deploy to EC2

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2-IP>

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Clone/upload your application
git clone <your-repo> || scp -r ./architecting ec2-user@<EC2-IP>:~

# Navigate and install
cd architecting
npm install

# Start application (use PM2 for production)
npm start

# Or with PM2 for auto-restart
sudo npm install -g pm2
pm2 start server.js --name product-app
pm2 startup
pm2 save
```

## API Endpoints

**Products (DynamoDB):**
- `POST /products` - Create product
- `GET /products` - List all products
- `GET /products/:id` - Get product by ID
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product

**Providers (RDS PostgreSQL):**
- `POST /providers` - Create provider
- `GET /providers` - List all providers
- `GET /providers/:id` - Get provider by ID
- `PUT /providers/:id` - Update provider
- `DELETE /providers/:id` - Delete provider

## Configuration

All connection parameters are in `app_config.json`:
- DynamoDB region and table name
- RDS PostgreSQL connection details
- S3 bucket name and region
- Server port
