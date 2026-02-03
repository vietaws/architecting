const express = require('express');
const { docClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, tableName } = require('../db/dynamodb');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { product_id, product_name, description, image_url, price, remaining_sku } = req.body;
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { product_id, product_name, description, image_url, price, remaining_sku }
    }));
    res.json({ message: 'Product created', product_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tableName }));
    res.json(result.Items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { product_id: req.params.id }
    }));
    res.json(result.Item || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { product_name, description, image_url, price, remaining_sku } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { product_id: req.params.id },
      UpdateExpression: 'set product_name = :n, description = :d, image_url = :i, price = :p, remaining_sku = :s',
      ExpressionAttributeValues: { ':n': product_name, ':d': description, ':i': image_url, ':p': price, ':s': remaining_sku }
    }));
    res.json({ message: 'Product updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { product_id: req.params.id }
    }));
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
