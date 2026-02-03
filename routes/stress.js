const express = require('express');
const { Worker } = require('worker_threads');
const os = require('os');
const http = require('http');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const router = express.Router();

let workers = [];
let cpuUsage = { user: 0, system: 0 };
let cachedInstanceId = null;

const ec2Client = new EC2Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Get instance ID from metadata service
async function getInstanceId() {
  if (cachedInstanceId) return cachedInstanceId;
  
  try {
    const token = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '169.254.169.254',
        path: '/latest/api/token',
        method: 'PUT',
        headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
        timeout: 1000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('timeout')));
      req.end();
    });

    cachedInstanceId = await new Promise((resolve, reject) => {
      http.get({
        host: '169.254.169.254',
        path: '/latest/meta-data/instance-id',
        headers: { 'X-aws-ec2-metadata-token': token },
        timeout: 1000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
    });

    return cachedInstanceId;
  } catch (error) {
    return 'local-dev';
  }
}

// Get CPU usage
function getCPUUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  
  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  
  return {
    usage: Math.max(0, Math.min(100, usage)),
    cores: cpus.length
  };
}

// Start stress test
router.post('/start', (req, res) => {
  const numWorkers = req.body.workers || os.cpus().length;
  
  if (workers.length > 0) {
    return res.json({ message: 'Stress test already running', workers: workers.length });
  }
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker('./stress-worker.js');
    workers.push(worker);
  }
  
  res.json({ message: 'Stress test started', workers: workers.length });
});

// Stop stress test
router.post('/stop', (req, res) => {
  workers.forEach(worker => {
    worker.postMessage('stop');
    worker.terminate();
  });
  
  workers = [];
  res.json({ message: 'Stress test stopped' });
});

// Get status
router.get('/status', async (req, res) => {
  const cpu = getCPUUsage();
  const instanceId = await getInstanceId();
  res.json({
    running: workers.length > 0,
    workers: workers.length,
    cpu: cpu.usage,
    cores: cpu.cores,
    instanceId: instanceId
  });
});

// Discover instances with tag project=miracle
router.get('/instances', async (req, res) => {
  try {
    const command = new DescribeInstancesCommand({
      Filters: [
        {
          Name: 'tag:project',
          Values: ['miracle']
        },
        {
          Name: 'instance-state-name',
          Values: ['running']
        }
      ]
    });

    const response = await ec2Client.send(command);
    const instances = [];

    response.Reservations?.forEach(reservation => {
      reservation.Instances?.forEach(instance => {
        instances.push({
          instanceId: instance.InstanceId,
          privateIp: instance.PrivateIpAddress,
          publicIp: instance.PublicIpAddress,
          state: instance.State.Name
        });
      });
    });

    res.json({ instances });
  } catch (error) {
    console.error('Error discovering instances:', error);
    res.status(500).json({ error: error.message, instances: [] });
  }
});

module.exports = router;
