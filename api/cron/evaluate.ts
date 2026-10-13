import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

declare const process: {
  env: Record<string, string | undefined>;
};

const WEBSTATE_ADDRESS = (process.env.WEBSTATE_ADDRESS || process.env.VITE_WEB_STATE_ADDRESS || "0xA91B2Ff8B66Dc44e22cD22c7243F5d034a2A6DD6").trim() as `0x${string}`;
const GENLAYER_ENDPOINT = (process.env.GENLAYER_ENDPOINT || process.env.VITE_GENLAYER_ENDPOINT || "https://studio.genlayer.com/api").trim();
const MIN_REEVALUATION_SECONDS = 20 * 60 * 60;
const MAX_WATCHES_PER_RUN = 3;
const FINALITY_INTERVAL_MS = 5_000;
const FINALITY_RETRIES = 60;

type WatchRecord = {
  watch_id: string;
  active: boolean;
  evaluated_at: bigint | number | string;
  evaluation_count: bigint | number | string;
};

type CronResult = {
  watchId: string;
  outcome: "evaluated" | "skipped" | "failed";
  transaction?: string;
  reason?: string;
};

export const maxDuration = 300;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function numeric(value: bigint | number | string | undefined): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function watchIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function executionFailed(receipt: unknown): boolean {
  if (!receipt || typeof receipt !== "object") return true;
  const value = String((receipt as { txExecutionResultName?: unknown }).txExecutionResultName || "");
  return value.length > 0 && value !== "FINISHED_WITH_RETURN";
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const privateKey = process.env.WEBSTATE_RELAYER_PRIVATE_KEY?.trim();
  if (!privateKey) {
    return json({ ok: false, setupRequired: true, error: "WEBSTATE_RELAYER_PRIVATE_KEY is not configured" }, 503);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(WEBSTATE_ADDRESS)) {
    return json({ ok: false, error: "WEBSTATE_ADDRESS is not configured correctly" }, 500);
  }

  try {
    const account = createAccount(privateKey as `0x${string}`);
    const client = createClient({ chain: studionet, endpoint: GENLAYER_ENDPOINT, account });
    const ids = await client.readContract({ address: WEBSTATE_ADDRESS, functionName: "get_watch_ids", args: [] });
    const now = Math.floor(Date.now() / 1000);
    const results: CronResult[] = [];
    let evaluated = 0;

    for (const watchId of watchIds(ids)) {
      if (evaluated >= MAX_WATCHES_PER_RUN) break;
      try {
        const before = await client.readContract({ address: WEBSTATE_ADDRESS, functionName: "get_watch", args: [watchId] }) as WatchRecord;
        if (!before.active) {
          results.push({ watchId, outcome: "skipped", reason: "inactive" });
          continue;
        }
        if (numeric(before.evaluated_at) > 0 && now - numeric(before.evaluated_at) < MIN_REEVALUATION_SECONDS) {
          results.push({ watchId, outcome: "skipped", reason: "evaluated within the last 20 hours" });
          continue;
        }

        const hash = await client.writeContract({ address: WEBSTATE_ADDRESS, functionName: "evaluate_watch", args: [watchId], value: 0n });
        const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: FINALITY_INTERVAL_MS, retries: FINALITY_RETRIES });
        if (executionFailed(receipt)) throw new Error("finalized transaction did not finish successfully");

        const after = await client.readContract({ address: WEBSTATE_ADDRESS, functionName: "get_watch", args: [watchId] }) as WatchRecord;
        if (numeric(after.evaluation_count) <= numeric(before.evaluation_count)) throw new Error("evaluation count did not advance after finality");
        evaluated += 1;
        results.push({ watchId, outcome: "evaluated", transaction: hash });
      } catch (error) {
        results.push({ watchId, outcome: "failed", reason: error instanceof Error ? error.message : "evaluation failed" });
      }
    }

    return json({ ok: true, contract: WEBSTATE_ADDRESS, processed: results.length, results });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "relayer run failed" }, 502);
  }
}
