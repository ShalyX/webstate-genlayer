# Recurring evaluation operator

WebState can periodically re-evaluate active watches through a protected Vercel Function. The browser wallet remains the user-facing signing path; recurring evaluation uses a separate relayer account held by the operator.

## What runs

`GET /api/cron/evaluate` enumerates active watches, skips watches evaluated within the last 20 hours, submits `evaluate_watch`, waits for `FINALIZED`, verifies that execution succeeded, and reads the watch back to confirm that `evaluation_count` advanced.

The schedule is daily at 06:00 UTC. This is compatible with Vercel Hobby scheduling. Higher-frequency monitoring needs a plan that supports more frequent cron intervals.

The function processes at most three watches per run and never logs or returns the relayer key.

## Required Vercel environment variables

Configure these in the Vercel project for the **Production** environment:

- `WEBSTATE_RELAYER_PRIVATE_KEY` — a dedicated, funded StudioNet relayer account. Do not use a personal wallet key.
- `CRON_SECRET` — a random secret of at least 16 characters. Vercel sends it as `Authorization: Bearer …` for cron invocations.
- `WEBSTATE_ADDRESS` — the deployed WebState contract address. The current deployment is `0xA91B2Ff8B66Dc44e22cD22c7243F5d034a2A6DD6`.
- `GENLAYER_ENDPOINT` — normally `https://studio.genlayer.com/api`.

Set the values with the Vercel dashboard or CLI. Never commit them to the repository or place them in the browser bundle.

## Manual smoke test

After the variables are configured and the production deployment is live, call the endpoint with the cron secret:

```powershell
Invoke-WebRequest `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } `
  -Uri "https://webstate.vercel.app/api/cron/evaluate"
```

The response contains only per-watch outcomes and transaction hashes. A missing relayer key returns `503` with `setupRequired: true` and performs no write.
