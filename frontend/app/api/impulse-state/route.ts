import { NextResponse } from "next/server";
import { getRedis, getMongoDB } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get("includeHistory") === "1";

    const redis = await getRedis();
    const raw = await redis.get("impulse_bot:state");
    const state = raw ? JSON.parse(raw) : null;

    if (!state) {
      return NextResponse.json({
        upPrice: null,
        downPrice: null,
        position: null,
        conditionId: null,
        upTokenId: null,
        downTokenId: null,
        marketStartTime: null,
        marketEndTime: null,
        priceHistory: null,
        impulseEvents: [],
        walletBalanceUsd: null,
        positionValueUsd: null,
      });
    }

    let priceHistory: { up: { ts: number; price: number }[]; down: { ts: number; price: number }[] } | null = null;
    let impulseEvents: { ts: number; price: number; side: string; time: string }[] = [];

    if (includeHistory && state.upTokenId && state.downTokenId) {
      const [upRaw, downRaw] = await Promise.all([
        redis.lRange(`impulse_bot:price_history:${state.upTokenId}`, 0, -1),
        redis.lRange(`impulse_bot:price_history:${state.downTokenId}`, 0, -1),
      ]);
      priceHistory = {
        up: (upRaw || []).map((s) => {
          try {
            return JSON.parse(s) as { ts: number; price: number };
          } catch {
            return { ts: 0, price: 0 };
          }
        }),
        down: (downRaw || []).map((s) => {
          try {
            return JSON.parse(s) as { ts: number; price: number };
          } catch {
            return { ts: 0, price: 0 };
          }
        }),
      };
    }

    if (state.conditionId) {
      const db = await getMongoDB();
      const buys = await db
        .collection("impulse_buys")
        .find({ conditionId: state.conditionId })
        .sort({ boughtAt: 1 })
        .toArray();
      impulseEvents = (buys as unknown as Array<{ boughtAt: number; price: number; side: string }>).map((b) => ({
        ts: b.boughtAt,
        price: b.price,
        side: b.side,
        time: new Date(b.boughtAt * 1000).toLocaleTimeString(),
      }));
    }

    if (priceHistory && priceHistory.up.length > 0 && priceHistory.down.length > 0) {
      const configRaw = await redis.get("impulse_bot:config");
      const config = configRaw
        ? (JSON.parse(configRaw) as { limitPrice?: number; minJump?: number; lookbackSec?: number })
        : {};
      const limitPrice = config.limitPrice ?? 0.55;
      const minJump = config.minJump ?? 0.05;
      const lookbackSec = config.lookbackSec ?? 60;

      const buyTsSet = new Set(impulseEvents.map((e) => e.ts));

      const JUMP_LOOKBACK_SEC = 2;

      const detectImpulses = (history: { ts: number; price: number }[], side: string) => {
        const satisfies = (idx: number): boolean => {
          const p = history[idx];
          const targetTs = p.ts - JUMP_LOOKBACK_SEC;
          const beforePoints = history.filter((h) => h.ts <= targetTs);
          if (beforePoints.length === 0) return false;
          const prev = beforePoints.reduce((a, b) => (a.ts > b.ts ? a : b));
          const jump = p.price - prev.price;
          return p.price >= limitPrice && jump >= minJump;
        };

        const out: { ts: number; price: number; side: string; time: string }[] = [];
        for (let i = 0; i < history.length; i++) {
          const p = history[i];
          const prevSatisfied = i > 0 && satisfies(i - 1);
          if (!satisfies(i)) continue;
          if (prevSatisfied) continue;

          const nearExisting = [...buyTsSet].some((t) => Math.abs(t - p.ts) <= 3);
          if (!nearExisting) {
            buyTsSet.add(p.ts);
            out.push({ ts: p.ts, price: p.price, side, time: new Date(p.ts * 1000).toLocaleTimeString() });
          }
        }
        return out;
      };

      const upImpulses = detectImpulses(priceHistory.up, "Up");
      const downImpulses = detectImpulses(priceHistory.down, "Down");
      impulseEvents = [...impulseEvents, ...upImpulses, ...downImpulses].sort((a, b) => a.ts - b.ts);
    }

    const walletBalanceUsd = await redis.get("impulse_bot:wallet_balance_usd");
    const positionValueUsd = await redis.get("impulse_bot:position_value_usd");

    return NextResponse.json({
      upPrice: state.upPrice ?? null,
      downPrice: state.downPrice ?? null,
      position: state.position ?? null,
      conditionId: state.conditionId ?? null,
      upTokenId: state.upTokenId ?? null,
      downTokenId: state.downTokenId ?? null,
      currentSlug: state.currentSlug ?? null,
      marketStartTime: state.marketStartTime ?? null,
      marketEndTime: state.marketEndTime ?? null,
      priceHistory,
      impulseEvents,
      walletBalanceUsd: walletBalanceUsd != null ? parseFloat(walletBalanceUsd) : null,
      positionValueUsd: positionValueUsd != null ? parseFloat(positionValueUsd) : null,
    });
  } catch (err) {
    console.error("[api/impulse-state]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
