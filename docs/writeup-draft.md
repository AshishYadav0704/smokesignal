# Submission writeup (draft: fill the brackets, cut to the form's length)

**Project:** SmokeSignal
**Track:** Air
**Live app:** [Amplify URL] · **Repo:** [GitHub URL] · **Video:** [YouTube URL] · **Blog:** [Builder Center URL]

## The problem
Every October–November, crop-residue fires in Punjab and Haryana send smoke across North India. Air quality apps report the damage after it arrives. Nobody tells a parent, a school or a city official that smoke is coming tonight, or which fires it comes from. That makes it hard to prepare, and hard to target enforcement and residue-management machines where they matter most.

## What we built
SmokeSignal is a live smoke early-warning system for 17 cities across North India, including the Punjab and Haryana cities inside the burning belt. Smoke from across the border is counted too.
- Every 3 hours it pulls NASA satellite fire detections and a 48-hour wind forecast, and simulates where each fire's smoke goes.
- For each city it gives: when smoke arrives, how heavy it is, the heaviest window, and which fire areas it comes from.
- It ranks fire areas in India by how much smoke they send towards people in the next 24 hours: a "fires to act on first" list for officials.
- It writes a short bulletin in English and Hindi from the computed numbers, ready to forward. The pipeline asks Amazon Bedrock (Amazon Nova Lite) to write it and falls back to a built-in template if Bedrock is unavailable. On our new Free-plan account Bedrock currently returns "Operation not allowed", so the live app shows the template.
- Anyone can subscribe for email alerts for their city. Alerts go out when moderate or heavy smoke is due within 24 hours.
- A replay mode re-runs any past day from the archives (fires and the wind forecast issued that day), so you can see how it would have warned each city on a bad November day.

## How AWS is used
- **AWS SAM** defines the whole stack as code.
- **Amazon EventBridge Scheduler** starts an **AWS Step Functions** pipeline every 3 hours (IST).
- Three **AWS Lambda** functions fetch fires (NASA FIRMS), winds (Open-Meteo) and CAMS PM2.5 **in parallel**. A fourth runs our trajectory model. A fifth calls **Amazon Bedrock (Amazon Nova Lite)** for the bulletin, with a template fallback. A sixth sends **Amazon SNS** email alerts, using subscription filter policies so each person only gets their city.
- **Amazon S3** stores raw inputs and snapshots. **Amazon DynamoDB** (single table with TTL) stores the latest pointer, per-city history, the alert log with a 12-hour cooldown, and subscribers.
- **Amazon API Gateway** serves the API. **AWS Amplify Hosting** serves the React app. **AWS X-Ray** traces the pipeline.

## How the model works
Fires are grouped into ~10 km clusters weighted by fire radiative power. Smoke parcels released from each cluster (now, +3 h and +6 h) are moved with the 925 hPa forecast wind using 2nd-order Runge-Kutta steps. Smoke weakens with travel time. A parcel within 35 km of a city counts as arriving. This is a simplified Lagrangian trajectory approach, like NOAA HYSPLIT trajectories, and it is covered by unit tests: a known wind gives the known arrival time.

## Limitations
It estimates when and from where smoke arrives, not PM2.5 concentrations, so we show the CAMS PM2.5 forecast as an independent check. Satellites miss fires under cloud, one wind level cannot capture night-time inversions, and we have not yet validated against ground monitors.

## What's next
Validate ETAs against CPCB station data over the season. Add WhatsApp and SMS alerts (DLT registration). Add district-level views for agriculture and pollution-control officials.

## AI tools used
[List all, e.g. Claude (Anthropic): code generation for the backend, model and frontend; ChatGPT: planning.]

## Team
[Name (GitHub): what they built] × 4
