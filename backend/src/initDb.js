const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy',
  }
});

const TABLE_NAME = process.env.USERS_TABLE || 'AICFO_Users';

async function initDB() {
  try {
    // Check if table exists
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`Table ${TABLE_NAME} already exists.`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Table ${TABLE_NAME} not found. Creating it now...`);
      const params = {
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' } // Partition key
        ],
        AttributeDefinitions: [
          { AttributeName: 'email', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      };
      await client.send(new CreateTableCommand(params));
      console.log(`Table ${TABLE_NAME} created successfully.`);
    } else {
      console.error('Error checking table:', error);
    }
  }
}

initDB();
