const { parentPort } = require('worker_threads');

// CPU-intensive task
function stress() {
  const start = Date.now();
  while (Date.now() - start < 100) {
    Math.sqrt(Math.random());
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
