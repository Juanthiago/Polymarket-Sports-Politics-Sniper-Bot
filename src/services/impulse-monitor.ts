/**
 * Impulse monitor: detect sudden price jumps, run trading loop.
 * Uses RealtimePriceService (WebSocket) for live Up/Down prices.
 */

import { PolymarketClient } from "../clients/polymarket";
import { RedisClient } from "../clients/redis";
import { MongoDBClient } from "../clients/mongodb";
import { buyToken } from "./impulse-trading";
import { getDefaultImpulseConfig } from "../config/env";
import { shortId } from "../config/env";
import type { ImpulseConfig, ImpulsePosition } from "../types";
import type { RealtimePriceService } from "./realtime-price-service";

function getSlugPrefix(config: ImpulseConfig & { slug?: string }): string {
  let raw = config.slugPrefix ?? (config as { slug?: string }).slug ?? "";
  if (raw.includes("-")) {
    const parts = raw.split("-");
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      return parts.slice(0, -1).join("-");
    }
  }
  return raw;
}

function isSuddenImpulse(
  history: { ts: number; price: number }[],
  currentPrice: number,
  config: ImpulseConfig
): boolean {
  if (history.length < 2) return false;
  const cutoff = Date.now() / 1000 - config.lookbackSec;
  const inWindow = history.filter((h) => h.ts >= cutoff);
  if (inWindow.length < 2) return false;
  const minPrice = Math.min(...inWindow.map((h) => h.price));
  const jump = currentPrice - minPrice;
  return currentPrice >= config.limitPrice && jump >= config.minJump;
}

export class ImpulseMonitor {
  private lastConditionId: string | null = null;

  constructor(
    private polymarket: PolymarketClient,
    private redis: RedisClient,
    private mongodb: MongoDBClient,
    private realtimePriceService: RealtimePriceService | null
  ) {}

  async processCycle(): Promise<void> {
    const enabled = await this.redis.getEnabled();
    if (!enabled) return;

    let config = await this.redis.getConfig();
    if (!config) {
      config = getDefaultImpulseConfig();
    }
    const slugPrefix = getSlugPrefix(config);
    const windowSeconds = config.windowSeconds ?? 900;

    if (!slugPrefix?.trim()) {
      console.log("Impulse: no slug prefix in config or POLYMARKET_SLUG_PREFIX");
      return;
    }

    const resolved = await this.polymarket.getCurrentOrNextEvent(slugPrefix, windowSeconds);
    if (!resolved) return;

    const { event, slug } = resolved;
    const marketInfo = this.polymarket.getMarketInfoFromEvent(event);
    if (!marketInfo?.upTokenId || !marketInfo.downTokenId) {
      console.log("Impulse: no token IDs for market");
      return;
    }

    if (this.lastConditionId !== marketInfo.conditionId) {
      this.lastConditionId = marketInfo.conditionId;
      this.realtimePriceService?.subscribe(
        marketInfo.conditionId,
        marketInfo.upTokenId,
        marketInfo.downTokenId
      );
    }

    let upPrice: number;
    let downPrice: number;

    if (this.realtimePriceService) {
      const upP = this.realtimePriceService.getPrice(marketInfo.upTokenId);
      const downP = this.realtimePriceService.getPrice(marketInfo.downTokenId);
      upPrice = upP ?? 0;
      downPrice = downP ?? 0;
      if (upPrice === 0 || downPrice === 0) {
        const cached = this.realtimePriceService.getCachedPrices();
        if (cached) {
          upPrice = upPrice || cached.upPrice || 0.5;
          downPrice = downPrice || cached.downPrice || 0.5;
        }
      }
    } else {
      const [upBook, downBook] = await Promise.all([
        this.polymarket.getOrderBook(marketInfo.upTokenId),
        this.polymarket.getOrderBook(marketInfo.downTokenId),
      ]);
      upPrice = upBook?.asks?.length ? parseFloat(upBook.asks[0].price) : 0.5;
      downPrice = downBook?.asks?.length ? parseFloat(downBook.asks[0].price) : 0.5;
    }

    const now = Date.now() / 1000;
    await this.redis.appendPriceHistory(marketInfo.upTokenId, now, upPrice || 0.5);
    await this.redis.appendPriceHistory(marketInfo.downTokenId, now, downPrice || 0.5);

    const upHistory = await this.redis.getPriceHistory(marketInfo.upTokenId, config.lookbackSec);
    const downHistory = await this.redis.getPriceHistory(marketInfo.downTokenId, config.lookbackSec);

    let position = await this.redis.getPosition(marketInfo.conditionId);

    const alreadyBoughtUp = await this.mongodb.hasBoughtToken(marketInfo.conditionId, "Up");
    const alreadyBoughtDown = await this.mongodb.hasBoughtToken(marketInfo.conditionId, "Down");

    if (!position) {
      if (!alreadyBoughtUp && upPrice > 0 && isSuddenImpulse(upHistory, upPrice, config)) {
        console.log(`Up impulse: ${upPrice.toFixed(2)} (jump from min in window)`);
        const ok = await buyToken(
          marketInfo.upTokenId!,
          "Up",
          "initial",
          config.buyAmountUsd,
          marketInfo,
          this.mongodb
        );
        if (ok) {
          position = {
            conditionId: marketInfo.conditionId,
            side: "Up",
            highestPrice: upPrice,
            boughtAt: Math.floor(now),
          };
          await this.redis.setPosition(marketInfo.conditionId, position);
        }
      } else if (!alreadyBoughtDown && downPrice > 0 && isSuddenImpulse(downHistory, downPrice, config)) {
        console.log(`Down impulse: ${downPrice.toFixed(2)} (jump from min in window)`);
        const ok = await buyToken(
          marketInfo.downTokenId!,
          "Down",
          "initial",
          config.buyAmountUsd,
          marketInfo,
          this.mongodb
        );
        if (ok) {
          position = {
            conditionId: marketInfo.conditionId,
            side: "Down",
            highestPrice: downPrice,
            boughtAt: Math.floor(now),
          };
          await this.redis.setPosition(marketInfo.conditionId, position);
        }
      }
    }

    if (position) {
      const currentPrice = position.side === "Up" ? upPrice : downPrice;
      const newHigh = Math.max(position.highestPrice, currentPrice);
      const drop = newHigh - currentPrice;
      const trailingStop = newHigh * (config.trailingStopPct / 100);

      if (drop >= trailingStop) {
        const hedgeTokenId = position.side === "Up" ? marketInfo.downTokenId! : marketInfo.upTokenId!;
        const hedgeSide = position.side === "Up" ? "Down" : "Up";

        if (!(await this.mongodb.hasBoughtToken(marketInfo.conditionId, hedgeSide))) {
          console.log(`Hedge: ${position.side} dropped ${(drop * 100).toFixed(1)}% from high ${newHigh.toFixed(2)}, buying ${hedgeSide}`);
          const ok = await buyToken(hedgeTokenId, hedgeSide, "hedge", config.buyAmountUsd, marketInfo, this.mongodb);
          if (ok) {
            await this.redis.setPosition(marketInfo.conditionId, null);
          }
        } else {
          await this.redis.setPosition(marketInfo.conditionId, null);
        }
      } else {
        const updated: ImpulsePosition = { ...position, highestPrice: newHigh };
        await this.redis.setPosition(marketInfo.conditionId, updated);
      }
    }

    await this.redis.setImpulseState({
      upPrice,
      downPrice,
      upTokenId: marketInfo.upTokenId,
      downTokenId: marketInfo.downTokenId,
      conditionId: marketInfo.conditionId,
      position,
      currentSlug: slug,
      slugPrefix,
      marketStartTime: marketInfo.startTime,
      marketEndTime: marketInfo.endTime,
    });
  }
}
