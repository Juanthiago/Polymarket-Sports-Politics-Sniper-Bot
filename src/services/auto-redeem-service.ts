/**
 * Auto-redeem service for impulse-bought positions.
 */

import { redeemMarket, isMarketResolved } from "../utils/redeem";
import { getAllHoldings, clearMarketHoldings } from "../utils/holdings";
import { tradingEnv } from "../config/env";
import { shortId } from "../config/env";
import type { MongoDBClient } from "../clients/mongodb";

const REDEEM_INTERVAL_MS = 160 * 1000;

let mongodbInstance: MongoDBClient | null = null;

async function checkAndRedeemPositions(): Promise<void> {
  if (!tradingEnv.ENABLE_AUTO_REDEEM) return;
  if (!tradingEnv.PRIVATE_KEY || !tradingEnv.PROXY_WALLET_ADDRESS) {
    return;
  }

  const holdings = getAllHoldings();
  const marketIds = Object.keys(holdings);

  if (marketIds.length === 0) return;

  for (const conditionId of marketIds) {
    const tokens = holdings[conditionId];
    const totalAmount = Object.values(tokens).reduce((sum, amt) => sum + amt, 0);

    try {
      const { isResolved, winningIndexSets } = await isMarketResolved(conditionId);

      if (!isResolved) continue;

      console.log(`${shortId(conditionId)} resolved, winning: ${winningIndexSets?.join(", ")}`);

      try {
        await redeemMarket(conditionId);
        if (mongodbInstance && totalAmount > 0) {
          const eventSlug = await mongodbInstance.getEventSlugByConditionId(conditionId);
          await mongodbInstance.saveRedeemRecord({
            conditionId,
            eventSlug: eventSlug ?? null,
            redeemedAt: Math.floor(Date.now() / 1000),
            tokensRedeemed: totalAmount,
            payoutUsd: totalAmount,
          });
        }
        clearMarketHoldings(conditionId);
        console.log(`Redeemed ${shortId(conditionId)}`);
      } catch (redeemError) {
        const errorMsg = redeemError instanceof Error ? redeemError.message : String(redeemError);
        if (
          errorMsg.includes("don't hold any winning tokens") ||
          errorMsg.includes("You don't have any tokens")
        ) {
          clearMarketHoldings(conditionId);
        } else {
          console.log(`Redemption failed: ${errorMsg}`);
        }
      }
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error));
    }
  }
}

export function startAutoRedeemService(mongodb?: MongoDBClient | null): void {
  mongodbInstance = mongodb ?? null;
  if (!tradingEnv.ENABLE_AUTO_REDEEM) return;
  if (!tradingEnv.PRIVATE_KEY || !tradingEnv.PROXY_WALLET_ADDRESS) {
    console.log("Auto-redeem: trading credentials not set");
    return;
  }

  console.log(`Auto-redeem started (${REDEEM_INTERVAL_MS / 1000}s)`);
  checkAndRedeemPositions();

  setInterval(() => {
    checkAndRedeemPositions().catch((err) => console.log("Auto-redeem error", err));
  }, REDEEM_INTERVAL_MS);
}
