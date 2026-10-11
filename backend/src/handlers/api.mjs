// Public HTTP API (API Gateway HTTP API -> this Lambda).
//   GET  /latest            latest snapshot (fires, trajectories, cities, bulletin)
//   GET  /cities            tracked cities
//   GET  /history?city=...  last 24 runs for a city
//   POST /subscribe         {email, city} -> SNS email subscription filtered to that city
//   POST /run               start the pipeline now (header x-admin-key required)
import { SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { CITIES, citiesBySlug } from '../lib/regions.mjs';
import { getItem, getJson, putItem, queryPk } from '../lib/aws.mjs';

const sns = new SNSClient({});
const sfn = new SFNClient({});
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

function readBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try { return JSON.parse(raw); } catch { return {}; }
}

const routes = {
  'GET /latest': async () => {
    const latest = await getItem('LATEST', 'LATEST');
    if (!latest) return json(404, { message: 'No forecast yet. Start the pipeline once (POST /run or from the Step Functions console).' });
    const snapshot = await getJson(latest.snapshotKey);
    return json(200, snapshot, { 'cache-control': 'public, max-age=60' });
  },

  'GET /cities': async () => json(200, CITIES),

  'GET /history': async (event) => {
    const slug = event.queryStringParameters?.city;
    if (!citiesBySlug[slug]) return json(400, { message: 'Unknown city' });
    const items = await queryPk(`CITY#${slug}`, { limit: 24 });
    return json(200, items.map(({ sk, level, level24, etaHours, arrivingFrp }) => ({ at: sk, level, level24, etaHours, arrivingFrp })));
  },

  'POST /subscribe': async (event) => {
    const { email, city } = readBody(event);
    if (typeof email !== 'string' || !EMAIL.test(email.trim())) return json(400, { message: 'Please enter a valid email.' });
    if (!citiesBySlug[city]) return json(400, { message: 'Unknown city' });
    const res = await sns.send(new SubscribeCommand({
      TopicArn: process.env.TOPIC_ARN,
      Protocol: 'email',
      Endpoint: email.trim(),
      Attributes: { FilterPolicy: JSON.stringify({ city: [city] }) },
      ReturnSubscriptionArn: true,
    }));
    await putItem({ pk: `SUB#${city}`, sk: email.trim().toLowerCase(), subscriptionArn: res.SubscriptionArn, createdAt: new Date().toISOString() });
    return json(200, { status: 'pending_confirmation', message: `Check ${email.trim()} and click "Confirm subscription" to get ${citiesBySlug[city].name} smoke alerts.` });
  },

  'POST /run': async (event) => {
    const key = event.headers?.['x-admin-key'];
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return json(401, { message: 'Admin key required' });
    const res = await sfn.send(new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      name: `manual-${Date.now()}`,
      input: '{}',
    }));
    return json(202, { executionArn: res.executionArn, startedAt: res.startDate });
  },
};

export const handler = async (event) => {
  const route = routes[event.routeKey];
  if (!route) return json(404, { message: 'Not found' });
  try {
    return await route(event);
  } catch (err) {
    console.error(JSON.stringify({ route: event.routeKey, error: err.message, stack: err.stack }));
    return json(500, { message: 'Something went wrong. Please try again.' });
  }
};
