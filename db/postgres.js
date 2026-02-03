const { Pool } = require('pg');
const config = require('../app_config.json');

const pool = new Pool({
  ...config.rds,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

module.exports = pool;
