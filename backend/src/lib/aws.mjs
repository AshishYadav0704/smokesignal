// Thin helpers around the AWS SDK v3 (bundled in the Lambda Node.js runtime).
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const BUCKET = process.env.DATA_BUCKET;
const TABLE = process.env.TABLE_NAME;
const DAY = 86400;

export async function putJson(key, data) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: JSON.stringify(data), ContentType: 'application/json' }));
  return key;
}

export async function getJson(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return JSON.parse(await res.Body.transformToString());
}

export async function getItem(pk, sk) {
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk } }));
  return res.Item || null;
}

export async function putItem(item, ttlDays) {
  const ttl = ttlDays ? Math.floor(Date.now() / 1000) + ttlDays * DAY : undefined;
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...item, ttl } }));
}

export async function putItems(items, ttlDays) {
  const ttl = ttlDays ? Math.floor(Date.now() / 1000) + ttlDays * DAY : undefined;
  for (let k = 0; k < items.length; k += 25) {
    const batch = items.slice(k, k + 25).map((Item) => ({ PutRequest: { Item: { ...Item, ttl } } }));
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: batch } }));
  }
}

export async function queryPk(pk, { limit = 24, newestFirst = true } = {}) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': pk },
    ScanIndexForward: !newestFirst,
    Limit: limit,
  }));
  return res.Items || [];
}

export const runPrefix = (runId) => `runs/${runId}`;
