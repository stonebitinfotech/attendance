import "server-only";

import { MongoClient, Db } from "mongodb";

type Cached = {
  client: MongoClient;
  db: Db;
};

const globalForMongo = globalThis as unknown as {
  __attandanceMongo?: Cached;
};

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI. Set it in your environment (e.g. .env.local)."
    );
  }
  return uri;
}

function getDbName(): string {
  const name = process.env.MONGODB_DB_NAME;
  if (!name) return "attandance";
  return name;
}

export async function getDb(): Promise<Db> {
  const cached = globalForMongo.__attandanceMongo;
  if (cached?.db) return cached.db;

  const client = new MongoClient(getMongoUri());
  await client.connect();

  const db = client.db(getDbName());
  globalForMongo.__attandanceMongo = { client, db };
  return db;
}

