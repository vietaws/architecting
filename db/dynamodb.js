const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const config = require('../app_config.json');

const client = new DynamoDBClient({ region: config.dynamodb.region });
const docClient = DynamoDBDocumentClient.from(client);

module.exports = { docClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, tableName: config.dynamodb.tableName };
