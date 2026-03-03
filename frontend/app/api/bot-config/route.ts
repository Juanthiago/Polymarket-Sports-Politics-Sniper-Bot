import { NextResponse } from "next/server";
import { getRedis } from "@/lib/db";

export async function GET() {
  try {
    const redis = await getRedis();
    const raw = await redis.get("impulse_bot:config");
    if (!raw) {
      return NextResponse.json({
        config: null,
        message: "No config in Redis, using env defaults",
      });
    }
    const config = JSON.parse(raw);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[api/bot-config GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = {
      slugPrefix: String(body.slugPrefix ?? body.slug ?? ""),
      windowSeconds: parseInt(body.windowSeconds, 10) || 900,
      limitPrice: parseFloat(body.limitPrice) || 0.55,
      minJump: parseFloat(body.minJump) || 0.05,
      lookbackSec: parseInt(body.lookbackSec, 10) || 60,
      trailingStopPct: parseFloat(body.trailingStopPct) || 5,
      buyAmountUsd: parseFloat(body.buyAmountUsd) || 10,
      pollIntervalMs: parseInt(body.pollIntervalMs, 10) || 2000,
    };

    const redis = await getRedis();
    await redis.set("impulse_bot:config", JSON.stringify(config));

    return NextResponse.json({ ok: true, config });
  } catch (err) {
    console.error("[api/bot-config POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
