const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  }
});

const db = DynamoDBDocumentClient.from(client);

module.exports = db;
