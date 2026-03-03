import { NextResponse } from "next/server";
import { getRedis } from "@/lib/db";

export async function GET() {
  try {
    const redis = await getRedis();
    const v = await redis.get("impulse_bot:enabled");
    const enabled = v === "1" || v?.toLowerCase() === "true";
    return NextResponse.json({ enabled });
  } catch (err) {
    console.error("[api/bot-enabled]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
