import { Side, OrderType, type UserMarketOrderV2, CreateOrderOptions } from "@polymarket/clob-client-v2";
import type { TradePayload } from "../utils/types";
import type { CopyTradeOptions } from "./types";

/**
 * Convert trade side string to Side enum
 */
export function parseTradeSide(side: string): Side {
    const upperSide = side.toUpperCase();
    if (upperSide === "BUY") {
        return Side.BUY;
    } else if (upperSide === "SELL") {
        return Side.SELL;
    }
    throw new Error(`Invalid trade side: ${side}`);
}

/**
 * Calculate the amount for a market order based on trade data
 * 
 * For BUY orders: amount is in USDC (price * size)
 * For SELL orders: amount is in shares (size)
 */
export function calculateMarketOrderAmount(
    trade: TradePayload,
    sizeMultiplier: number = 1.0,
    maxAmount?: number
): number {
    const adjustedSize = trade.size * sizeMultiplier;
    
    if (trade.side.toUpperCase() === "BUY") {
        // BUY: amount is in USDC (price * size)
        let calculatedAmount = trade.price * adjustedSize;
        if(calculatedAmount < 1) {
            return 1;
        }
        if (maxAmount !== undefined && calculatedAmount > maxAmount) {
            calculatedAmount = maxAmount*0.5;
            return maxAmount;
        }
        return calculatedAmount;
    } else {
        // SELL: amount is in shares
        return adjustedSize;
    }
}

/**
 * Convert a trade payload to a UserMarketOrderV2
 */
export function tradeToMarketOrder(options: CopyTradeOptions): UserMarketOrderV2 {
    const { trade, maxAmount, sizeMultiplier = 1.0, orderType = OrderType.FAK } = options;
    
    const side = parseTradeSide(trade.side);
    const amount = calculateMarketOrderAmount(trade, sizeMultiplier, maxAmount);
    
    const marketOrder: UserMarketOrderV2 = {
        tokenID: trade.asset,
        side,
        amount,
        orderType
    };
    
    // For market orders, price is optional (uses market price if not provided)
    // But we can include it as a hint
    // if (trade.price) {
    //     marketOrder.price = trade.price;
    // }
    
    return marketOrder;
}

/**
 * Get default order options based on trade
 */
export function getDefaultOrderOptions(
    tickSize: CreateOrderOptions["tickSize"] = "0.01",
    negRisk: boolean = false
): Partial<CreateOrderOptions> {
    return {
        tickSize,
        negRisk,
    };
}

