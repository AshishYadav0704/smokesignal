# Team plan: Saturday night → Sunday submission

Check the exact deadline on the submission form tonight. Plan to **submit by 6 PM Sunday** regardless.

## Before anything (everyone, 10 minutes)
- [ ] Each of the 4 is registered for the tour **and checked in to Environmental Hacks** with their own account.
- [ ] Each of the 4 has AWS Builder Center student verification done (needed for the Amazon fast-track).
- [ ] Captain creates the public GitHub repo, pushes this code, and adds the other three as collaborators.
- [ ] Everyone works on their own branch or files and commits from **their own GitHub account**, so each person's work is visible.

## Roles

### Member 1: AWS and deployment (captain)
- [ ] New AWS account on the **Free plan** (not Paid), region ap-south-1, MFA on root, zero-spend AWS Budget.
- [ ] Plain IAM users for teammates. **Do not** use IAM Identity Center or AWS Organizations: joining Organizations converts a Free-plan account to Paid.
- [ ] Never commit AWS access keys to GitHub.
- [ ] Bedrock console (us-east-1): run one prompt on Amazon Nova Lite in the playground.
- [ ] Install AWS CLI + SAM CLI, then `sam build && sam deploy --parameter-overrides FirmsMapKey=... AdminKey=...`
- [ ] `POST /run`, then watch the Step Functions execution go green and `GET /latest` return data.
- [ ] Amplify Hosting from GitHub (monorepo root `frontend`, env `VITE_API_URL`, `AMPLIFY_MONOREPO_APP_ROOT=frontend`).
- [ ] Redeploy with `AppUrl=` set to the Amplify URL.
- **Target: live URL with a real forecast by 11:30 PM tonight.**

### Member 2: smoke model and real-data check
- [ ] Get the NASA FIRMS map key and share it with Member 1.
- [ ] `cd backend && npm test`, then `FIRMS_MAP_KEY=... npm run local`.
- [ ] Sanity-check against the FIRMS fire map and a wind map: do the fire areas and smoke directions look right?
- [ ] If every city is "none" or every city is "high", tune `levels` in `smoke.mjs` and document why in the README.
- [ ] Try `WIND_LEVEL=10m` versus `925hPa` locally and note the difference for the writeup.

### Replay for the demo (anyone, 15 min)
- [ ] Try a few November dates and keep the one where Delhi is clearly hit:
  `$env:REPLAY_DATE="2025-11-11"; npm run local` (also try 2025-11-04, 2025-11-08, 2024-11-10, 2024-11-14).
- [ ] Commit `frontend/public/replay.json`. The app then shows a Live / Replay switch.
- [ ] `Remove-Item Env:REPLAY_DATE` before running live again.

### Member 3: frontend
- [ ] `cd frontend && npm install && npm run dev` on `local-latest.json` (real data).
- [ ] Check the phone layout, keyboard use, and empty states ("no smoke expected").
- [ ] Once the API is live, point `VITE_API_URL` at it and test subscribe.
- [ ] Replace `docs/screenshot-sample-data.png` with a real screenshot, and update the README caption.

### Member 4: AI, alerts and story
- [ ] Subscribe your email, confirm it, run the pipeline, and check the alert arrives (pick an affected city).
- [ ] Read the Bedrock bulletin. If it invents anything, tighten `SYSTEM_PROMPT` in `bulletin-text.mjs`.
- [ ] Own `docs/demo-script.md`, `docs/writeup-draft.md`, and the README Team + AI tools sections.
- [ ] Write the AWS Builder Center blog (the top 5 blogs win AirPods; link it in the submission). Suggested title: "Tracking stubble smoke with Step Functions and Bedrock in a weekend". Cover the problem, the architecture, the model, and what fought back.

## Sunday timeline
| Time | What |
|---|---|
| 8 AM – 1 PM | Fix what real data revealed, edge cases, README |
| **1 PM** | **Feature freeze** |
| 1 – 3 PM | Writeup, blog, team + AI-tools sections |
| 3 – 5 PM | Record, edit, upload the video (unlisted), test the link signed out |
| 5 – 6 PM | Captain submits once: repo, video, writeup, blog link, all 4 names |

## If something breaks
- **Bedrock denied:** the app keeps working with template bulletins; fix model access or pass another `BedrockModelId`.
- **FIRMS key problems:** check the key status from the FIRMS API page (firms.modaps.eosdis.nasa.gov/api/), and that it has not hit the transaction limit.
- **Amplify build fails:** run `npm run build` locally and use Amplify's "Deploy without Git" (drag in `frontend/dist`).
- **No smoke reaching any city in the live data:** that is a real answer. Show it, and demo the flow on whichever city has the most smoke.
