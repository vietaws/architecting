# RDS PostgreSQL Connection Troubleshooting

## Common Issues

### 1. Check RDS Endpoint Configuration

Verify `app_config.json` has correct RDS details:
```json
{
  "rds": {
    "host": "your-db.xxxxx.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "database": "products_db",
    "user": "admin",
    "password": "your-password"
  }
}
```

### 2. Test RDS Connection from EC2

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2-IP>

# Install PostgreSQL client
sudo yum install -y postgresql15

# Test connection
psql -h your-db.xxxxx.us-east-1.rds.amazonaws.com \
     -U admin \
     -d products_db \
     -c "SELECT version();"
```

### 3. Verify Table Exists

```bash
psql -h <RDS-ENDPOINT> -U admin -d products_db -c "\dt"
psql -h <RDS-ENDPOINT> -U admin -d products_db -c "SELECT * FROM providers;"
```

If table doesn't exist:
```bash
psql -h <RDS-ENDPOINT> -U admin -d products_db -f setup.sql
```

### 4. Check RDS Security Group

RDS security group must allow inbound traffic from EC2:
```bash
# Get EC2 security group ID
EC2_SG=$(aws ec2 describe-instances \
  --instance-ids <INSTANCE-ID> \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

# Get RDS security group ID
RDS_SG=$(aws rds describe-db-instances \
  --db-instance-identifier <DB-IDENTIFIER> \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

# Add rule to allow EC2 to access RDS
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG \
  --protocol tcp \
  --port 5432 \
  --source-group $EC2_SG
```

### 5. Check Application Logs

```bash
pm2 logs product-app --lines 50
```

Look for errors like:
- `ECONNREFUSED` - RDS not accessible
- `password authentication failed` - Wrong credentials
- `database "products_db" does not exist` - Database not created
- `relation "providers" does not exist` - Table not created

### 6. Test Provider Creation via API

```bash
# Test from EC2
curl -X POST http://localhost:3000/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "PROV001",
    "provider_name": "Test Provider",
    "provider_city": "New York"
  }'

# Check response for specific error
```

### 7. Verify Database and Table Setup

```sql
-- Connect to RDS
psql -h <RDS-ENDPOINT> -U admin -d postgres

-- Check if database exists
\l

-- If not, create it
CREATE DATABASE products_db;

-- Connect to database
\c products_db

-- Create table
CREATE TABLE IF NOT EXISTS providers (
    provider_id VARCHAR(50) PRIMARY KEY,
    provider_name VARCHAR(255) NOT NULL,
    provider_city VARCHAR(100)
);

-- Verify table
\dt
\d providers
```

## Quick Fix Steps

1. **Verify RDS is accessible:**
   ```bash
   telnet <RDS-ENDPOINT> 5432
   ```

2. **Check credentials:**
   ```bash
   psql -h <RDS-ENDPOINT> -U admin -d products_db
   ```

3. **Recreate table:**
   ```bash
   psql -h <RDS-ENDPOINT> -U admin -d products_db -f setup.sql
   ```

4. **Restart app:**
   ```bash
   pm2 restart product-app
   pm2 logs product-app
   ```

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | RDS security group blocks EC2 | Add EC2 SG to RDS inbound rules |
| `password authentication failed` | Wrong password in config | Update `app_config.json` |
| `database does not exist` | Database not created | Run `CREATE DATABASE products_db` |
| `relation does not exist` | Table not created | Run `setup.sql` |
| `timeout` | RDS in different VPC/subnet | Ensure RDS and EC2 in same VPC |
