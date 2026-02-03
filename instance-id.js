const http = require('http');

async function getInstanceId() {
  // Get token
  const token = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '169.254.169.254',
      path: '/latest/api/token',
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });

  // Get instance ID with token
  return new Promise((resolve, reject) => {
    http.get({
      host: '169.254.169.254',
      path: '/latest/meta-data/instance-id',
      headers: { 'X-aws-ec2-metadata-token': token }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Usage
getInstanceId()
  .then(instanceId => console.log('Instance ID:', instanceId))
  .catch(err => console.error('Error:', err));