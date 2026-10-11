// Step 4: email subscribers of cities where moderate/heavy smoke arrives within 24 h.
// One SNS topic; each subscription has a filter policy {"city": ["delhi"]},
// so each person only gets alerts for the city they chose.
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { shouldAlert, alertSubject, alertMessage } from '../lib/alerts.mjs';
import { getJson, getItem, putItem } from '../lib/aws.mjs';

const sns = new SNSClient({});
const WINDOW_H = Number(process.env.ALERT_WINDOW_HOURS || 24);

export const handler = async (event) => {
  const snapshot = await getJson(event.snapshotKey);
  const sent = [];
  for (const city of snapshot.cities) {
    const last = await getItem(`ALERT#${city.slug}`, 'LAST');
    if (!shouldAlert(city, last, { windowHours: WINDOW_H })) continue;
    await sns.send(new PublishCommand({
      TopicArn: process.env.TOPIC_ARN,
      Subject: alertSubject(city),
      Message: alertMessage(city, snapshot, process.env.APP_URL),
      MessageAttributes: { city: { DataType: 'String', StringValue: city.slug } },
    }));
    await putItem({ pk: `ALERT#${city.slug}`, sk: 'LAST', level: city.level24, sentAt: new Date().toISOString(), runId: event.runId });
    sent.push(city.slug);
  }
  console.log(JSON.stringify({ step: 'notify', sent }));
  return { runId: event.runId, snapshotKey: event.snapshotKey, alertsSent: sent };
};
