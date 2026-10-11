// Step 3: Amazon Bedrock turns the numbers into a short English + Hindi bulletin,
// then the snapshot is published as LATEST. Falls back to a template if Bedrock fails.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { SYSTEM_PROMPT, buildUserPrompt, parseModelJson, fallbackBulletin } from '../lib/bulletin-text.mjs';
import { getJson, putJson, putItem } from '../lib/aws.mjs';

const bedrock = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || process.env.AWS_REGION });
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
const DEVANAGARI = /[ऀ-ॿ]/;

async function askBedrock(snapshot) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ text: buildUserPrompt(snapshot) }] }],
    inferenceConfig: { maxTokens: 900, temperature: 0.2 },
  }), { abortSignal: AbortSignal.timeout(25_000) });
  const text = res.output?.message?.content?.map((c) => c.text || '').join('') ?? '';
  return { ...parseModelJson(text), usage: res.usage };
}

export const handler = async (event) => {
  const snapshot = await getJson(event.snapshotKey);
  const fallback = fallbackBulletin(snapshot);
  let bulletin;
  try {
    const ai = await askBedrock(snapshot);
    bulletin = {
      en: ai.en,
      hi: DEVANAGARI.test(ai.hi) ? ai.hi : fallback.hi,
      source: 'bedrock',
      model: MODEL_ID,
    };
    console.log(JSON.stringify({ step: 'bulletin', source: 'bedrock', model: MODEL_ID, usage: ai.usage }));
  } catch (err) {
    bulletin = { ...fallback, source: 'template', error: err.message };
    console.warn(JSON.stringify({ step: 'bulletin', source: 'template', error: err.message }));
  }

  snapshot.bulletin = bulletin;
  await putJson(event.snapshotKey, snapshot);
  await putItem({ pk: 'LATEST', sk: 'LATEST', snapshotKey: event.snapshotKey, runId: event.runId, generatedAt: snapshot.generatedAt, summary: event.summary });
  return { ...event, bulletinSource: bulletin.source };
};
