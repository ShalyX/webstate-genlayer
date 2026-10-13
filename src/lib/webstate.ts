import { STUDIONET_CHAIN_ID_HEX } from "./webstateNetwork";

const FINALITY_INTERVAL_MS = 5_000;
const FINALITY_RETRIES = 60;
const env = import.meta.env ?? {};

export const webStateAddress = (env.VITE_WEB_STATE_ADDRESS || "").trim();
export const studioEndpoint = (env.VITE_GENLAYER_ENDPOINT || "https://studio.genlayer.com/api").trim();

type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type Client = {
  readContract(request: Record<string, unknown>): Promise<unknown>;
  writeContract(request: Record<string, unknown>): Promise<string>;
  waitForTransactionReceipt(request: Record<string, unknown>): Promise<unknown>;
};

export type WatchRecord = {
  watch_id: string;
  owner: string;
  url: string;
  condition: string;
  active: boolean;
  revision: bigint | number;
  status: string;
  page_fingerprint: string;
  summary: string;
  rationale: string;
  evaluated_at: bigint | number;
  evaluation_count: bigint | number;
};

export function getProvider(): Provider | null {
  return typeof window !== "undefined" ? (window as Window & { ethereum?: Provider }).ethereum ?? null : null;
}

export function hasDeployment(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(webStateAddress);
}

export async function getWallet(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  const accounts = await provider.request({ method: "eth_accounts" });
  return Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
}

export async function connectWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Install Rabby or another browser wallet to continue.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("The wallet did not return an account.");
  return accounts[0];
}

export async function switchToStudioNet(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error("Connect a browser wallet first.");
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: STUDIONET_CHAIN_ID_HEX }] });
}

async function client(account?: string): Promise<Client> {
  const [{ createClient }, { studionet }] = await Promise.all([import("genlayer-js"), import("genlayer-js/chains")]);
  return createClient({
    chain: studionet,
    endpoint: studioEndpoint,
    ...(account ? { account: account as `0x${string}` } : {}),
    ...(account && getProvider() ? { provider: getProvider() as never } : {}),
  }) as unknown as Client;
}

async function write(account: string, functionName: string, args: unknown[]): Promise<string> {
  const sdk = await client(account);
  const hash = await sdk.writeContract({ address: webStateAddress, functionName, args, value: 0n });
  await sdk.waitForTransactionReceipt({ hash, status: "FINALIZED", interval: FINALITY_INTERVAL_MS, retries: FINALITY_RETRIES });
  return hash;
}

export async function createWatch(account: string, watchId: string, url: string, condition: string): Promise<string> {
  return write(account, "create_watch", [watchId, url, condition]);
}

export async function evaluateWatch(account: string, watchId: string): Promise<string> {
  return write(account, "evaluate_watch", [watchId]);
}

export async function getWatch(watchId: string): Promise<WatchRecord> {
  const sdk = await client();
  return sdk.readContract({ address: webStateAddress, functionName: "get_watch", args: [watchId] }) as Promise<WatchRecord>;
}

