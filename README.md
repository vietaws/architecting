# AWS Architecting Labs — Overview

A collection of hands-on AWS labs covering core services and architectural patterns.

📚 Link to buy this full course: https://viet.vn/udemy/architecting

✅ See more courses on my website: https://viet.vn


Thank you for your supporting my developments! 🚀🚀🚀

Viet Tran 

hello@viet.vn

---

## Labs Summary

| Branch | Lab | Key Services |
|---|---|---|
| `lab01-ec2-simple-website` | EC2 Simple Website | EC2, PostgreSQL, Node.js |
| `lab02-container` | Docker Containerization | Docker, ECR, ECS |
| `lab03-ebs-image-uploader` | Image Uploader — EBS | EC2, EBS |
| `lab04-efs-image-uploader` | Image Uploader — EFS | EC2, EFS |
| `lab05-s3-image-uploader` | Image Uploader — S3 | EC2, S3, IAM |
| `lab06-data-lake` | Simple Data Lake | S3, Glue, Athena, Lake Formation |
| `lab07-lambda-image-converter` | Lambda Image Converter | Lambda, S3, Pillow Layer |
| `lab08-rds-inventory` | Inventory App — RDS | EC2, RDS PostgreSQL |
| `lab09-crud-lambda-dynamodb` | CRUD API — Lambda + DynamoDB | Lambda, DynamoDB, API Gateway |
| `lab10-auto-scaling` | Auto Scaling Inventory App | EC2, RDS, ALB, Auto Scaling |
| `lab11-serverless-todo` | Serverless Todo App | Lambda, DynamoDB, API Gateway, S3 |
| `lab12-automation` | EC2 Automation with Amazon EventBridge | EC2, AWS SDK (Node.js) |
| `lab12-iac` | Infrastructure as Code | CloudFormation, CDK (TypeScript) |
| `lab14-cicd` | CI/CD Pipeline | CodePipeline, CodeBuild, CodeDeploy, EFS |
| `lab15-cloudfront` | CloudFront Distribution | CloudFront, S3 (OAC), EC2, Origin Groups |
| `lab16-rag` | Build AI Assistant with Amazon Bedrock | Amazon Bedrock, Knowlege Base, Lambda, API Gateway, S3 Vector |
| `lab17-DR` | Disaster Recovery on AWS | Backup & Restore, Pilot Light, Warm-standby, Multi Site Active Active |
| `lab18-capstone` | CRM Application (Capstone) | EC2, RDS, DynamoDB, S3, EFS |

---

## Lab Details

### lab01 — EC2 Simple Website
Products management app (CRUD) deployed on EC2 with a PostgreSQL database.
- Node.js + Express backend, vanilla JS frontend
- PostgreSQL on the same EC2 instance
- Demonstrates basic EC2 deployment and database connectivity

### lab02 — Docker Containerization
Containerize a Node.js Express app with Docker.
- Build, tag, and run Docker images
- Multi-platform builds
- Foundation for ECS/ECR labs

### lab03 — Image Uploader (EBS)
Upload and display images stored on an EC2-attached EBS volume.
- Files stored at `/data/ebs`
- Displays AWS region and instance ID via metadata
- Single-instance storage (not shared)

### lab04 — Image Uploader (EFS)
Same image uploader but backed by Amazon EFS for shared storage across instances.
- EFS mounted at `/mnt/efs` with TLS
- Persistent mount via `/etc/fstab`
- Demonstrates shared storage across multiple EC2 instances

### lab05 — Image Uploader (S3)
Image uploader that stores files directly in S3 using presigned URLs.
- EC2 instance with IAM role for S3 access
- Presigned URLs for secure image retrieval
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` permissions

### lab06 — Simple Data Lake
End-to-end data lake on S3 with governance via Lake Formation.
- Raw zone → Glue ETL (JSON → Parquet) → Processed zone
- Glue Crawler auto-catalogs schema into Glue Data Catalog
- Athena for serverless SQL queries
- Lake Formation for table/column/row-level access control
- S3 Lifecycle policy archives raw data to Glacier after 90 days

### lab07 — Lambda Image Converter
Serverless image processing triggered by S3 uploads.
- Lambda converts uploaded images to WebP, resizes, and watermarks
- Custom Pillow Lambda layer built on Amazon Linux 2023
- S3 `input/` prefix triggers Lambda → writes to `output/`

### lab08 — Inventory App (RDS)
Inventory management system backed by Amazon RDS PostgreSQL.
- EC2 application server in public subnet
- RDS PostgreSQL in private subnet
- Security group restricts DB access to app server only

### lab09 — CRUD API (Lambda + DynamoDB)
Four Lambda functions exposing a REST API for a `products` DynamoDB table.
- Node.js 22.x ES modules
- Create / Read / Update / Delete handlers
- API Gateway routes to individual Lambda functions
- `PAY_PER_REQUEST` billing on DynamoDB

### lab10 — Auto Scaling
Extends the RDS Inventory app with high availability and auto scaling.
- Application Load Balancer across public subnets
- Auto Scaling Group (min 2 / max 4) in private subnets
- RDS PostgreSQL in private subnets
- Launch template with user data for automated app setup

### lab11 — S3 File Manager (Browser Upload) - Update Later
Static website hosted on S3 that uploads files directly from the browser.
- AWS SDK v3 loaded from CDN
- Cognito Identity Pool for unauthenticated browser credentials
- No backend server — fully client-side upload to S3

### lab11 — Serverless Todo App
Full serverless CRUD app for managing todos.
- 4 Lambda functions (GET / POST / PUT / DELETE)
- API Gateway REST API with CORS
- DynamoDB `todos` table
- Static frontend deployable to S3 + CloudFront

### lab12 — EC2 Automation Scripts
Node.js scripts using AWS SDK to automate EC2 instance management.
- `1-turn-off-ec2-instances.mjs` — stop instances
- `2-turn-on-ec2-instances.mjs` — start instances
- `3-change-instance-type.mjs` — resize instance type

### lab13 — Infrastructure as Code (IaC)
Three approaches to provisioning a full AWS stack.
- **CloudFormation (learning)** — 16 progressive demos from skeleton to nested stacks
- **CloudFormation (production)** — VPC + ALB + ASG + Aurora split into 3 stacks
- **CDK TypeScript** — same production infra as CDK stacks
- Architecture: ALB → ASG (t4g.micro) → Aurora PostgreSQL 16

### lab14 — CI/CD Pipeline
Automated deployment pipeline for the EFS image uploader app.
- **CodeBuild** — installs dependencies, runs tests (`buildspec.yml`)
- **CodeDeploy** — deploys to EC2 with lifecycle hooks (`appspec.yml`)
  - `BeforeInstall` → `ApplicationStop` → `AfterInstall` → `ApplicationStart` → `ValidateService`
- Pipeline: CodeCommit/GitHub → CodeBuild → CodeDeploy → EC2

### lab15 — CloudFront Distribution
CloudFront setup with multiple origins and failover.
- **Part 1**: Private S3 origin via OAC (no public bucket)
- **Part 2**: EC2 as second origin for `/images/*` path
- **Part 3**: Origin Group with EC2 (active) + S3 (passive failover)

### lab18 — CRM Capstone
Full CRM application combining multiple AWS storage services.
- **Products module**: RDS PostgreSQL + S3 for product images
- **Customers module**: DynamoDB + EFS for customer avatars
- **Metadata & Stress**: EC2 instance metadata + load testing
- Demonstrates polyglot persistence (SQL + NoSQL + object + file storage)

---

## Prerequisites (All Labs)

- AWS account with appropriate IAM permissions
- AWS CLI configured (`aws configure`)
- Node.js 22.x for application labs
- Docker
