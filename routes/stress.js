const express = require('express');
const { Worker } = require('worker_threads');
const os = require('os');
const router = express.Router();

let workers = [];
let cpuUsage = { user: 0, system: 0 };

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
router.get('/status', (req, res) => {
  const cpu = getCPUUsage();
  res.json({
    running: workers.length > 0,
    workers: workers.length,
    cpu: cpu.usage,
    cores: cpu.cores
  });
});

module.exports = router;
