const express = require('express');
const multer = require('multer');
const { docClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, tableName } = require('../db/dynamodb');
const { uploadImage, getImageUrl, deleteImage } = require('../db/s3');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { product_id, product_name, description, price, remaining_sku } = req.body;
    
    if (!product_id || !product_name) {
      return res.status(400).json({ error: 'product_id and product_name are required' });
    }

    let image_key = '';
    if (req.file) {
      image_key = await uploadImage(req.file, product_id);
    }

    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { 
        product_id, 
        product_name, 
        description: description || '', 
        image_key, 
        price: price ? parseFloat(price) : 0, 
        remaining_sku: remaining_sku ? parseInt(remaining_sku) : 0 
      }
    }));
    
    const image_url = image_key ? await getImageUrl(image_key) : '';
    res.json({ message: 'Product created', product_id, image_url });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tableName }));
    const products = await Promise.all(result.Items.map(async (item) => ({
      ...item,
      image_url: await getImageUrl(item.image_key)
    })));
    res.json(products);
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
    if (result.Item) {
      result.Item.image_url = await getImageUrl(result.Item.image_key);
    }
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
      UpdateExpression: 'set product_name = :n, description = :d, price = :p, remaining_sku = :s',
      ExpressionAttributeValues: { ':n': product_name, ':d': description, ':p': price, ':s': remaining_sku }
    }));
    res.json({ message: 'Product updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // Get product to retrieve image_key
    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { product_id: req.params.id }
    }));

    // Delete image from S3 if exists
    if (result.Item && result.Item.image_key) {
      await deleteImage(result.Item.image_key);
    }

    // Delete product from DynamoDB
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { product_id: req.params.id }
    }));

    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
