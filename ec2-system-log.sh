# Check if cloud-init ran successfully
sudo cloud-init status

# View last 50 lines of output log
sudo tail -50 /var/log/cloud-init-output.log

# Check for errors
sudo grep -i error /var/log/cloud-init-output.log