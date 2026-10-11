# Demo video script (aim for 2:45, hard limit 3:00)

Judges only see this video. Record the **live deployment with real data**, never the sample-data build.
Before recording, run the pipeline once (`POST /run`) so the forecast is fresh, and confirm your test email subscription.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | App loading; fire dots appear over Punjab | "Every October, thousands of farm fires burn across Punjab and Haryana. Hours later their smoke reaches cities like Delhi, and nobody gets a warning. SmokeSignal tells you when the smoke will arrive, and which fires it is coming from." |
| 0:15–0:55 | Smoke plays forward 24 h; point at the big ETA; switch city in the dropdown | "This is tonight's live forecast: [N] fires seen by NASA satellites in the last 24 hours. Press play and the smoke moves with the forecast winds. For [city]: [level] smoke in about [X] hours, heaviest between [time] and [time], mostly from fires near [area] and [area]." |
| 0:55–1:20 | Click #1 in "Fires to act on first"; its smoke lights up on the map | "For officials, we rank fire areas by how much smoke they send towards people. Fires near [area] send smoke to [N] million people within a day. That is where crop-residue machines and enforcement should go first." |
| 1:20–1:40 | Bulletin, switch to Hindi, Copy | "Amazon Bedrock turns the numbers into a short bulletin in English and Hindi that a school or residents' association can forward. The numbers come from our model; the AI only writes the words." |
| 1:40–2:05 | Subscribe form → phone shows the alert email | "Anyone can subscribe for their city. When moderate or heavy smoke is due within 24 hours, Amazon SNS emails them before it arrives." |
| 2:05–2:35 | Architecture diagram → Step Functions execution graph (all green) → EventBridge schedule → DynamoDB items → `sam deploy` | "It all runs serverless on AWS. EventBridge Scheduler starts a Step Functions pipeline every three hours. Three Lambdas fetch fires, winds and air quality in parallel, a fourth runs our trajectory model, then Bedrock and SNS. Data lives in S3 and DynamoDB, and the whole stack is one SAM template." |
| 2:35–2:50 | "How this forecast works" panel; CAMS chart | "It is a trajectory estimate, not a pollution measurement, so we show the CAMS PM2.5 forecast as an independent check. Next: validate against CPCB monitors across the season, and add WhatsApp alerts." |

## Recording tips
- 1080p screen recording (OBS, or the Xbox Game Bar on Windows). Close other tabs and turn off notifications.
- Record voice separately if the room is noisy, then lay it over the screen recording.
- Zoom the browser to 110–125% so text is readable on a phone.
- Upload to YouTube as **Unlisted**, then open the link in a signed-out (incognito) window before submitting.
- If the live data shows little smoke reaching Delhi, use whichever city is affected. "No smoke expected" is also an honest, useful answer; show it briefly.
