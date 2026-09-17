const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../db');

const TABLE_NAME = process.env.USERS_TABLE || 'AICFO_Users';

const userModel = {
  async createUser(user) {
    const params = {
      TableName: TABLE_NAME,
      Item: {
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        createdAt: new Date().toISOString()
      },
      ConditionExpression: 'attribute_not_exists(email)'
    };
    await db.send(new PutCommand(params));
    return user;
  },

  async getUserByEmail(email) {
    const params = {
      TableName: TABLE_NAME,
      Key: { email }
    };
    const { Item } = await db.send(new GetCommand(params));
    return Item;
  },

  async updateFinancials(email, financials) {
    const params = {
      TableName: TABLE_NAME,
      Key: { email },
      UpdateExpression: 'set financials = :f, updatedAt = :u',
      ExpressionAttributeValues: {
        ':f': financials,
        ':u': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    const { Attributes } = await db.send(new UpdateCommand(params));
    return Attributes;
  }
};

module.exports = userModel;
