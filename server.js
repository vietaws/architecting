const express = require('express');
const path = require('path');
const config = require('./app_config.json');
const productRoutes = require('./routes/products');
const providerRoutes = require('./routes/providers');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/products', productRoutes);
app.use('/providers', providerRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(config.server.port, () => {
  console.log(`Server running on port ${config.server.port}`);
});
