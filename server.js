const express = require('express');
const path = require('path');
const config = require('./app_config.json');
const productRoutes = require('./routes/products');
const providerRoutes = require('./routes/providers');
const stressRoutes = require('./routes/stress');
const efsRoutes = require('./routes/efs');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/products', productRoutes);
app.use('/providers', providerRoutes);
app.use('/stress', stressRoutes);
app.use('/efs', efsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/instance-id', async (req, res) => {
  try {
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
    // const instanceId = await response.text();
    const instanceId = await new Promise((resolve, reject) => {
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
    res.json({ instanceId });
  } catch (error) {
    res.json({ instanceId: 'local-dev' });
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

app.listen(config.server.port, () => {
  console.log(`Server running on port ${config.server.port}`);
});
