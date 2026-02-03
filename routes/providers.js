const express = require('express');
const pool = require('../db/postgres');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { provider_id, provider_name, provider_city } = req.body;
    
    if (!provider_id || !provider_name) {
      return res.status(400).json({ error: 'provider_id and provider_name are required' });
    }

    console.log('Creating provider:', { provider_id, provider_name, provider_city });
    
    await pool.query('INSERT INTO providers (provider_id, provider_name, provider_city) VALUES ($1, $2, $3)', 
      [provider_id, provider_name, provider_city || null]);
    
    res.json({ message: 'Provider created', provider_id });
  } catch (error) {
    console.error('Provider creation error:', error);
    res.status(500).json({ error: error.message, detail: error.detail });
  }
});

router.get('/', async (req, res) => {
  try {
    console.log('Fetching all providers...');
    const result = await pool.query('SELECT * FROM providers');
    console.log(`Found ${result.rows.length} providers`);
    res.json(result.rows);
  } catch (error) {
    console.error('Provider fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM providers WHERE provider_id = $1', [req.params.id]);
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { provider_name, provider_city } = req.body;
    await pool.query('UPDATE providers SET provider_name = $1, provider_city = $2 WHERE provider_id = $3',
      [provider_name, provider_city, req.params.id]);
    res.json({ message: 'Provider updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM providers WHERE provider_id = $1', [req.params.id]);
    res.json({ message: 'Provider deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
