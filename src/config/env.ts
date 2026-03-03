import { resolve } from "path";
import { config as dotenvConfig } from "dotenv";
import type { ImpulseConfig } from "../types";

dotenvConfig({ path: resolve(process.cwd(), ".env") });

function parseNum(value: string | undefined, defaultVal: number): number {
  if (value === undefined || value === "") return defaultVal;
  const n = parseFloat(value);
  return Number.isNaN(n) ? defaultVal : n;
}

export function maskAddress(addr: string): string {
  if (!addr || addr.length < 12) return "***";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function shortId(id: string, head = 10, tail = 6): string {
  if (!id || id.length <= head + tail) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export const tradingEnv = {
  get PRIVATE_KEY(): string | undefined {
    return process.env.PRIVATE_KEY;
  },
  get CHAIN_ID(): number {
    return parseNum(process.env.CHAIN_ID, 137);
  },
  get CLOB_API_URL(): string {
    return process.env.CLOB_API_URL || "https://clob.polymarket.com";
  },
  get PROXY_WALLET_ADDRESS(): string {
    return process.env.PROXY_WALLET_ADDRESS || "";
  },
  get RPC_URL(): string | undefined {
    return process.env.RPC_URL;
  },
  get RPC_TOKEN(): string | undefined {
    return process.env.RPC_TOKEN;
  },
  get TICK_SIZE(): "0.01" | "0.1" {
    const v = process.env.TICK_SIZE;
    return v === "0.1" ? "0.1" : "0.01";
  },
  get NEG_RISK(): boolean {
    return process.env.NEG_RISK === "true";
  },
  get ENABLE_IMPULSE_BOT(): boolean {
    return process.env.ENABLE_IMPULSE_BOT !== "false";
  },
  get ENABLE_AUTO_REDEEM(): boolean {
    return process.env.ENABLE_AUTO_REDEEM !== "false";
  },
  get IMPULSE_LIMIT_PRICE(): number {
    return parseNum(process.env.IMPULSE_LIMIT_PRICE, 0.55);
  },
  get IMPULSE_MIN_JUMP(): number {
    return parseNum(process.env.IMPULSE_MIN_JUMP, 0.05);
  },
  get IMPULSE_LOOKBACK_SEC(): number {
    return parseNum(process.env.IMPULSE_LOOKBACK_SEC, 60);
  },
  get IMPULSE_TRAILING_STOP_PCT(): number {
    return parseNum(process.env.IMPULSE_TRAILING_STOP_PCT, 5);
  },
  get IMPULSE_BUY_AMOUNT_USD(): number {
    return parseNum(process.env.IMPULSE_BUY_AMOUNT_USD, 10);
  },
  get IMPULSE_POLL_INTERVAL_MS(): number {
    return parseNum(process.env.IMPULSE_POLL_INTERVAL_MS, 2000);
  },
  get POLYMARKET_SLUG_PREFIX(): string {
    return process.env.POLYMARKET_SLUG_PREFIX || process.env.POLYMARKET_EVENT_SLUG || "";
  },
  get IMPULSE_WINDOW_SECONDS(): number {
    return parseNum(process.env.IMPULSE_WINDOW_SECONDS, 900);
  },
};

export function getRpcUrl(chainId: number): string {
  if (tradingEnv.RPC_URL) {
    const url = tradingEnv.RPC_URL.trim();
    if (url.startsWith("wss://")) return url.replace(/^wss:\/\//, "https://");
    if (url.startsWith("ws://")) return url.replace(/^ws:\/\//, "http://");
    return url;
  }
  if (chainId === 137) {
    if (tradingEnv.RPC_TOKEN) return `https://polygon-mainnet.g.alchemy.com/v2/${tradingEnv.RPC_TOKEN}`;
    return "https://polygon-mainnet.g.alchemy.com/v2/Ag-cC4rPDzO7TbKw3Uaqj";
  }
  if (chainId === 80002) {
    if (tradingEnv.RPC_TOKEN) return `https://polygon-amoy.g.alchemy.com/v2/${tradingEnv.RPC_TOKEN}`;
    return "https://rpc-amoy.polygon.technology";
  }
  throw new Error(`Unsupported chain ID: ${chainId}`);
}

export function getDefaultImpulseConfig(): ImpulseConfig {
  return {
    slugPrefix: tradingEnv.POLYMARKET_SLUG_PREFIX,
    windowSeconds: tradingEnv.IMPULSE_WINDOW_SECONDS,
    limitPrice: tradingEnv.IMPULSE_LIMIT_PRICE,
    minJump: tradingEnv.IMPULSE_MIN_JUMP,
    lookbackSec: tradingEnv.IMPULSE_LOOKBACK_SEC,
    trailingStopPct: tradingEnv.IMPULSE_TRAILING_STOP_PCT,
    buyAmountUsd: tradingEnv.IMPULSE_BUY_AMOUNT_USD,
    pollIntervalMs: tradingEnv.IMPULSE_POLL_INTERVAL_MS,
  };
}
