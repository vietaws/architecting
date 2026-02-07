#!/bin/bash
# EFS Setup Script for EC2 Instance
# This script installs EFS utilities and mounts EFS automatically

set -e

# Variables - UPDATE THESE
EFS_ID="fs-xxxxxxxxx"  # Your EFS File System ID
AWS_REGION="us-east-1"
MOUNT_POINT="/data/efs"

echo "Installing EFS utilities..."
dnf install -y amazon-efs-utils

echo "Creating mount point..."
mkdir -p $MOUNT_POINT

echo "Adding EFS to /etc/fstab for auto-mount..."
# Remove existing entry if present
sed -i "\|$MOUNT_POINT|d" /etc/fstab

# Add new entry
echo "$EFS_ID:/ $MOUNT_POINT efs _netdev,tls,iam 0 0" >> /etc/fstab

echo "Mounting EFS..."
mount -a

echo "Setting permissions..."
chmod 777 $MOUNT_POINT

echo "Verifying mount..."
df -h | grep $MOUNT_POINT

echo "EFS setup complete!"
echo "Mount point: $MOUNT_POINT"
echo "EFS ID: $EFS_ID"
