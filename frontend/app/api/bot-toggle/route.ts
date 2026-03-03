import { NextResponse } from "next/server";
import { getRedis } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled === true || body.enabled === "true" || body.enabled === 1;

    const redis = await getRedis();
    await redis.set("impulse_bot:enabled", enabled ? "1" : "0");

    return NextResponse.json({ ok: true, enabled });
  } catch (err) {
    console.error("[api/bot-toggle]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
