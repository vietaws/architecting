#!/bin/bash
# EFS Upload Troubleshooting Script

echo "=== EFS Upload Troubleshooting ==="
echo ""

# Check if EFS is mounted
echo "1. Checking EFS mount..."
if mount | grep -q "/data/efs"; then
    echo "✓ EFS is mounted at /data/efs"
    df -h | grep /data/efs
else
    echo "✗ EFS is NOT mounted"
    echo "  Creating fallback directory..."
    mkdir -p /home/ec2-user/architecting/uploads
    chmod 777 /home/ec2-user/architecting/uploads
fi
echo ""

# Check mount point permissions
echo "2. Checking /data/efs permissions..."
if [ -d "/data/efs" ]; then
    ls -la /data/efs
    echo ""
    echo "Testing write access..."
    if touch /data/efs/test-write.txt 2>/dev/null; then
        echo "✓ Write access OK"
        rm /data/efs/test-write.txt
    else
        echo "✗ No write access - fixing permissions..."
        sudo chmod 777 /data/efs
    fi
else
    echo "✗ /data/efs does not exist"
fi
echo ""

# Check /tmp permissions
echo "3. Checking /tmp permissions..."
ls -la /tmp | head -5
if touch /tmp/test-write.txt 2>/dev/null; then
    echo "✓ /tmp write access OK"
    rm /tmp/test-write.txt
else
    echo "✗ No write access to /tmp"
fi
echo ""

# Check application logs
echo "4. Recent application logs..."
sudo journalctl -u product-app -n 20 --no-pager
echo ""

# Test upload endpoint
echo "5. Testing upload endpoint..."
curl -X POST http://localhost:3000/efs/upload \
  -F "image=@/dev/null" 2>&1 | head -5
echo ""

echo "=== Troubleshooting Complete ==="
echo ""
echo "If EFS is not mounted, the app will use: /home/ec2-user/architecting/uploads"
echo "To mount EFS manually: sudo mount -a"
