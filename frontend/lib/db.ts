import { MongoClient, Db } from "mongodb";
import { createClient } from "redis";

let mongodbClient: MongoClient | null = null;
let mongodbDb: Db | null = null;
let redisClient: ReturnType<typeof createClient> | null = null;

export async function getMongoDB(): Promise<Db> {
  if (!mongodbDb) {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const dbName = process.env.MONGODB_DB || "polymarket_impulse";
    mongodbClient = new MongoClient(uri);
    await mongodbClient.connect();
    mongodbDb = mongodbClient.db(dbName);
  }
  return mongodbDb;
}

export async function getRedis() {
  if (!redisClient) {
    const host = process.env.REDIS_HOST || "localhost";
    const port = parseInt(process.env.REDIS_PORT || "6379", 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    redisClient = createClient({
      socket: { host, port },
      password,
    });
    redisClient.on("error", (err) => console.error("[Redis Error]", err));
    await redisClient.connect();
  }
  return redisClient;
}
