import { MongoClient, Db, Collection } from "mongodb";
import type { ImpulseBuyDoc, RedeemRecordDoc } from "../types";

export class MongoDBClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const dbName = process.env.MONGODB_DB || "polymarket_impulse";

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);

    await this.db.collection("impulse_buys").createIndex({ conditionId: 1 });
    await this.db.collection("impulse_buys").createIndex({ boughtAt: -1 });
    await this.db.collection("impulse_buys").createIndex({ conditionId: 1, side: 1 });
    await this.db.collection("redeem_history").createIndex({ redeemedAt: -1 });
    await this.db.collection("redeem_history").createIndex({ conditionId: 1 });
  }

  async disconnect(): Promise<void> {
    if (this.client) await this.client.close();
    this.client = null;
    this.db = null;
  }

  async saveImpulseBuy(doc: ImpulseBuyDoc): Promise<void> {
    if (!this.db) throw new Error("MongoDB not connected");
    await this.db.collection<ImpulseBuyDoc>("impulse_buys").insertOne(doc);
  }

  async hasBoughtToken(conditionId: string, side: "Up" | "Down"): Promise<boolean> {
    if (!this.db) return false;
    const doc = await this.db
      .collection<ImpulseBuyDoc>("impulse_buys")
      .findOne({ conditionId, side });
    return doc != null;
  }

  async getImpulseBuys(filter?: { conditionId?: string }, limit = 100): Promise<ImpulseBuyDoc[]> {
    if (!this.db) return [];
    const query: Record<string, unknown> = {};
    if (filter?.conditionId) query.conditionId = filter.conditionId;
    return this.db
      .collection<ImpulseBuyDoc>("impulse_buys")
      .find(query)
      .sort({ boughtAt: -1 })
      .limit(limit)
      .toArray();
  }

  async saveRedeemRecord(doc: RedeemRecordDoc): Promise<void> {
    if (!this.db) throw new Error("MongoDB not connected");
    await this.db.collection<RedeemRecordDoc>("redeem_history").insertOne(doc);
  }

  async getEventSlugByConditionId(conditionId: string): Promise<string | null> {
    if (!this.db) return null;
    const doc = await this.db
      .collection<ImpulseBuyDoc>("impulse_buys")
      .findOne({ conditionId }, { projection: { eventSlug: 1 } });
    return doc?.eventSlug ?? null;
  }
}
