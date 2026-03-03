export interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  startDate?: string;
  endDate?: string;
  markets?: Array<{
    id: string;
    conditionId?: string;
    eventStartTime?: string;
    startDate?: string;
    clobTokenIds?: string | string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface MarketInfo {
  conditionId: string;
  eventSlug: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  upTokenId: string | null;
  downTokenId: string | null;
}

export interface ImpulseBuyDoc {
  conditionId: string;
  eventSlug: string;
  side: "Up" | "Down";
  type: "initial" | "hedge";
  tokenId: string;
  price: number;
  amountUsd: number;
  shares: number;
  boughtAt: number;
}

export interface RedeemRecordDoc {
  conditionId: string;
  eventSlug: string | null;
  redeemedAt: number;
  tokensRedeemed: number;
  payoutUsd: number;
}

export interface ImpulseConfig {
  slugPrefix: string;
  windowSeconds: number;
  limitPrice: number;
  minJump: number;
  lookbackSec: number;
  trailingStopPct: number;
  buyAmountUsd: number;
  pollIntervalMs: number;
}

export interface ImpulsePosition {
  conditionId: string;
  side: "Up" | "Down";
  highestPrice: number;
  boughtAt: number;
}
