# Stress Test Feature Implementation

## Overview
Added CPU stress test feature using Node.js Worker Threads to simulate high CPU load and monitor EC2 instance performance.

## Files Created

### 1. `stress-worker.js` (Root directory)
Worker thread that performs CPU-intensive calculations in a loop.
- Runs continuous `Math.sqrt()` operations
- Listens for 'stop' message to terminate
- Each worker runs independently

### 2. `routes/stress.js`
API endpoints for stress test control:
- `POST /stress/start` - Start stress test with worker threads
- `POST /stress/stop` - Stop all worker threads
- `GET /stress/status` - Get current CPU usage and status

## Files Modified

### 1. `server.js`
- Added `const stressRoutes = require('./routes/stress');`
- Added `app.use('/stress', stressRoutes);`

### 2. `public/index.html`
- Added "Stress Test" tab button
- Added stress test page with:
  - Start/Stop buttons
  - Real-time status display (Status, Workers, CPU %, Cores)

### 3. `public/style.css`
- Added styles for stress test page
- Grid layout for status items
- Responsive design

### 4. `public/app.js`
- Added tab switching for stress test
- Added `startStress()` - Starts stress test
- Added `stopStress()` - Stops stress test
- Added `loadStressStatus()` - Polls status every 1 second
- Auto-refresh CPU usage when stress test is running

## How It Works

### Backend (Worker Threads)
1. User clicks "Start Stress Test"
2. Server creates N worker threads (default = number of CPU cores)
3. Each worker runs CPU-intensive loop
4. CPU usage increases as workers consume resources
5. Server monitors CPU usage using `os.cpus()`
6. User clicks "Stop" to terminate all workers

### Frontend
1. User navigates to "Stress Test" tab
2. Clicks "Start Stress Test" button
3. Frontend polls `/stress/status` every 1 second
4. Displays real-time:
   - Status: Running/Stopped
   - Workers: Number of active threads
   - CPU Usage: Current percentage
   - CPU Cores: Total cores available
5. Clicks "Stop Stress Test" to end

## Deployment Steps

```bash
# 1. Push to GitHub
git add .
git commit -m "Add stress test feature with worker threads"
git push origin main

# 2. Update on EC2
ssh -i your-key.pem ec2-user@<EC2-IP>
cd /home/ec2-user/architecting
git pull origin main
npm install

# 3. Restart application
pm2 restart product-app
# OR
sudo systemctl restart product-app

# 4. Test
# Open browser: http://<EC2-IP>:3000
# Click "Stress Test" tab
# Click "Start Stress Test"
# Watch CPU usage increase
```

## Testing Auto Scaling

1. Start stress test on EC2 instance
2. CPU usage will spike to ~100%
3. CloudWatch alarm triggers (if CPU > 70%)
4. Auto Scaling Group launches new instances
5. Load balancer distributes traffic
6. Stop stress test to see scale-in

## API Endpoints

### Start Stress Test
```bash
curl -X POST http://localhost:3000/stress/start
# Response: {"message":"Stress test started","workers":4}
```

### Stop Stress Test
```bash
curl -X POST http://localhost:3000/stress/stop
# Response: {"message":"Stress test stopped"}
```

### Get Status
```bash
curl http://localhost:3000/stress/status
# Response: {"running":true,"workers":4,"cpu":95.2,"cores":4}
```

## Architecture Benefits

### Why Worker Threads?
- **True parallelism**: Each worker runs on separate CPU core
- **Non-blocking**: Main thread remains responsive
- **Controlled**: Can start/stop workers dynamically
- **Realistic**: Simulates actual CPU-bound workload

### CPU Calculation
Uses `os.cpus()` to calculate real-time CPU usage:
- Measures idle vs total CPU time
- Returns percentage across all cores
- Updates every second

## Monitoring

### Check CPU on EC2
```bash
# Via SSH
top
htop

# Via CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=<INSTANCE-ID> \
  --start-time 2026-02-03T15:00:00Z \
  --end-time 2026-02-03T16:00:00Z \
  --period 300 \
  --statistics Average
```

## Troubleshooting

**Stress test not starting:**
- Check logs: `pm2 logs product-app`
- Verify worker file exists: `ls stress-worker.js`

**CPU not increasing:**
- Workers may be limited by single core
- Increase worker count in code
- Check system resources: `top`

**Auto Scaling not triggering:**
- Verify CloudWatch alarm configured
- Check alarm threshold (should be < 100%)
- Ensure Auto Scaling policy attached

## Security Note

This feature should be **disabled in production** or protected with authentication to prevent abuse. Consider:
- Adding API authentication
- Rate limiting
- Admin-only access
- Removing from production builds
