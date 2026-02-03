const { parentPort } = require('worker_threads');

// CPU-intensive task
function stress() {
  const start = Date.now();
  while (Date.now() - start < 1000) {
    for (let i = 0; i < 1000000; i++) {
      Math.sqrt(Math.random() * Math.random());
      Math.pow(Math.random(), Math.random());
      Math.sin(Math.random()) * Math.cos(Math.random());
    }
  }
}

// Run stress continuously
let running = true;

parentPort.on('message', (msg) => {
  if (msg === 'stop') {
    running = false;
    parentPort.postMessage('stopped');
    process.exit(0);
  }
});

while (running) {
  stress();
}
