import { NextResponse } from "next/server";
import { getMongoDB } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conditionId = searchParams.get("conditionId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const db = await getMongoDB();
    const query: Record<string, string> = {};
    if (conditionId) query.conditionId = conditionId;

    const buys = await db
      .collection("impulse_buys")
      .find(query)
      .sort({ boughtAt: -1 })
      .limit(Math.min(limit, 200))
      .toArray();

    return NextResponse.json(buys);
  } catch (err) {
    console.error("[api/impulse-buys]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
