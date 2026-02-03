const { Pool } = require('pg');
const config = require('../app_config.json');

const pool = new Pool(config.rds);

module.exports = pool;
