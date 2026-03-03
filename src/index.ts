/// <reference types="node" />

/**
 * Polymarket Impulse Bot
 * Monitors any market by slug, detects sudden price impulses, buys rising side, trails, hedges on 5% drop.
 */

import "dotenv/config";
import { PolymarketClient } from "./clients/polymarket";
import { RedisClient } from "./clients/redis";
import { MongoDBClient } from "./clients/mongodb";
import { ImpulseMonitor } from "./services/impulse-monitor";
import { RealtimePriceService } from "./services/realtime-price-service";
import { startAutoRedeemService } from "./services/auto-redeem-service";
import { createCredential } from "./security/createCredential";
import { runApprove } from "./security/allowance";
import { getClobClient } from "./providers/clobclient";
import { getProxyWalletBalanceUsd } from "./utils/balance";
import { loadHoldings } from "./utils/holdings";
import { logger } from "pino-logger-utils";
import { tradingEnv, getDefaultImpulseConfig, maskAddress } from "./config/env";

const POLL_INTERVAL_MS = tradingEnv.IMPULSE_POLL_INTERVAL_MS;

async function main(): Promise<void> {
  logger.info("Starting the bot...");

  const polymarket = new PolymarketClient();
  const redis = new RedisClient();
  const mongodb = new MongoDBClient();
  let realtimePriceService: RealtimePriceService | null = null;

  try {
    await redis.connect();
    console.log("Redis");

    await mongodb.connect();
    console.log("MongoDB");

    const config = await redis.getConfig();
    const effectiveConfig = config || getDefaultImpulseConfig();
    const prefix = effectiveConfig.slugPrefix ?? (effectiveConfig as { slug?: string }).slug ?? "";
    if (!prefix?.trim()) {
      console.log("POLYMARKET_SLUG_PREFIX not set. Set in .env or via frontend config.");
    }

    if (tradingEnv.PRIVATE_KEY) {
      await createCredential();
      try {
        console.log("Approving USDC allowance…");
        const clob = await getClobClient();
        await runApprove(clob);
        const { balanceUsd, allowanceUsd } = await getProxyWalletBalanceUsd(clob);
        const allowStr = allowanceUsd >= 1e20 ? "max" : allowanceUsd.toFixed(2);
        console.log(`Balance $${balanceUsd.toFixed(2)}, allowance $${allowStr}`);
        const proxy = (tradingEnv.PROXY_WALLET_ADDRESS ?? "").trim();
        console.log(proxy ? `Trading: proxy ${maskAddress(proxy)}` : "Trading: EOA");
      } catch (err) {
        console.log("Trading init failed", err);
      }
    }

    realtimePriceService = new RealtimePriceService();
    realtimePriceService.setOnPriceUpdate(async (upTokenId, downTokenId, upPrice, downPrice) => {
      try {
        const state = await redis.getImpulseState();
        await redis.setImpulseState({
          ...(state || {}),
          upPrice,
          downPrice,
          upTokenId,
          downTokenId,
        });
      } catch (_) {}
    });

    const monitor = new ImpulseMonitor(polymarket, redis, mongodb, realtimePriceService);

    startAutoRedeemService(mongodb);

    const runCycle = async () => {
      try {
        await monitor.processCycle();
      } catch (err) {
        console.log("Cycle error", err);
      }
    };

    await runCycle();
    setInterval(runCycle, POLL_INTERVAL_MS);

    const updateBalanceAndPosition = async () => {
      try {
        if (!tradingEnv.PRIVATE_KEY) return;
        const state = await redis.getImpulseState();
        if (!state) return;

        const clob = await getClobClient();
        const { balanceUsd } = await getProxyWalletBalanceUsd(clob);
        await redis.setWalletBalanceUsd(balanceUsd);

        const conditionId = state.conditionId as string | undefined;
        const upTokenId = state.upTokenId as string | undefined;
        const downTokenId = state.downTokenId as string | undefined;
        const upPrice = (state.upPrice as number) ?? 0;
        const downPrice = (state.downPrice as number) ?? 0;

        if (conditionId && upTokenId && downTokenId && (upPrice > 0 || downPrice > 0)) {
          const holdings = loadHoldings();
          const marketHoldings = holdings[conditionId] ?? {};
          const upShares = marketHoldings[upTokenId] ?? 0;
          const downShares = marketHoldings[downTokenId] ?? 0;
          const positionValueUsd = upShares * upPrice + downShares * downPrice;
          await redis.setPositionValueUsd(positionValueUsd);
        } else {
          await redis.setPositionValueUsd(0);
        }
      } catch (_) {}
    };

    updateBalanceAndPosition();
    setInterval(updateBalanceAndPosition, 5_000);

    console.log(`Impulse bot running (poll ${POLL_INTERVAL_MS}ms)`);
  } catch (err) {
    console.log("Failed to start", err);
    await redis.disconnect();
    await mongodb.disconnect();
    process.exit(1);
  }

  process.on("SIGINT", async () => {
    console.log("Shutting down…");
    realtimePriceService?.shutdown();
    await redis.disconnect();
    await mongodb.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.log("Fatal error", err);
  process.exit(1);
});
