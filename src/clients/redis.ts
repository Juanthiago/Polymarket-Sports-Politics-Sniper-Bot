import { createClient, RedisClientType } from "redis";
import type { ImpulseConfig, ImpulsePosition } from "../types";

const BOT_ENABLED_KEY = "impulse_bot:enabled";
const BOT_CONFIG_KEY = "impulse_bot:config";
const POSITION_KEY_PREFIX = "impulse_bot:position:";
const PRICE_HISTORY_KEY_PREFIX = "impulse_bot:price_history:";

export class RedisClient {
  private client: RedisClientType | null = null;

  async connect(): Promise<void> {
    const host = process.env.REDIS_HOST || "localhost";
    const port = parseInt(process.env.REDIS_PORT || "6379", 10);
    const password = process.env.REDIS_PASSWORD || undefined;

    this.client = createClient({
      socket: { host, port },
      password: password || undefined,
    });
    this.client.on("error", (err) => console.error("[Redis Error]", err));
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  async getEnabled(): Promise<boolean> {
    if (!this.client) return false;
    const v = await this.client.get(BOT_ENABLED_KEY);
    if (v === null) return process.env.ENABLE_IMPULSE_BOT !== "false";
    return v === "1" || v.toLowerCase() === "true";
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.client) return;
    await this.client.set(BOT_ENABLED_KEY, enabled ? "1" : "0");
  }

  async getConfig(): Promise<ImpulseConfig | null> {
    if (!this.client) return null;
    const raw = await this.client.get(BOT_CONFIG_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ImpulseConfig;
    } catch {
      return null;
    }
  }

  async setConfig(config: ImpulseConfig): Promise<void> {
    if (!this.client) return;
    await this.client.set(BOT_CONFIG_KEY, JSON.stringify(config));
  }

  async getPosition(conditionId: string): Promise<ImpulsePosition | null> {
    if (!this.client) return null;
    const key = `${POSITION_KEY_PREFIX}${conditionId}`;
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ImpulsePosition;
    } catch {
      return null;
    }
  }

  async setPosition(conditionId: string, position: ImpulsePosition | null): Promise<void> {
    if (!this.client) return;
    const key = `${POSITION_KEY_PREFIX}${conditionId}`;
    if (position) {
      await this.client.set(key, JSON.stringify(position), { EX: 86400 * 7 });
    } else {
      await this.client.del(key);
    }
  }

  async appendPriceHistory(tokenId: string, ts: number, price: number): Promise<void> {
    if (!this.client) return;
    const key = `${PRICE_HISTORY_KEY_PREFIX}${tokenId}`;
    const entry = JSON.stringify({ ts, price });
    await this.client.rPush(key, entry);
    const lookback = 300;
    const len = await this.client.lLen(key);
    if (len > lookback) {
      await this.client.lTrim(key, -lookback, -1);
    }
  }

  async getPriceHistory(tokenId: string, lookbackSec: number): Promise<{ ts: number; price: number }[]> {
    if (!this.client) return [];
    const key = `${PRICE_HISTORY_KEY_PREFIX}${tokenId}`;
    const cutoff = Date.now() / 1000 - lookbackSec;
    const raw = await this.client.lRange(key, 0, -1);
    const parsed = raw
      .map((s) => {
        try {
          const o = JSON.parse(s) as { ts: number; price: number };
          return o.ts >= cutoff ? o : null;
        } catch {
          return null;
        }
      })
      .filter((o): o is { ts: number; price: number } => o != null);
    return parsed;
  }

  async setImpulseState(data: {
    upPrice?: number;
    downPrice?: number;
    upTokenId?: string;
    downTokenId?: string;
    conditionId?: string;
    position?: ImpulsePosition | null;
    currentSlug?: string;
    slugPrefix?: string;
    marketStartTime?: number;
    marketEndTime?: number;
  }): Promise<void> {
    if (!this.client) return;
    await this.client.set("impulse_bot:state", JSON.stringify(data), { EX: 60 });
  }

  async getImpulseState(): Promise<Record<string, unknown> | null> {
    if (!this.client) return null;
    const raw = await this.client.get("impulse_bot:state");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async setWalletBalanceUsd(value: number): Promise<void> {
    if (!this.client) return;
    await this.client.set("impulse_bot:wallet_balance_usd", String(value), { EX: 60 });
  }

  async setPositionValueUsd(value: number): Promise<void> {
    if (!this.client) return;
    await this.client.set("impulse_bot:position_value_usd", String(value), { EX: 60 });
  }
}
