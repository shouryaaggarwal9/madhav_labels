import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI?.trim();
const databaseName = process.env.MONGODB_DB?.trim() || "madhav_labels";

// Serverless functions are frozen between requests, so the client is cached on
// the global object: a warm instance reuses one connection pool instead of
// opening one per request and exhausting the Atlas connection limit.
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/** True when the server has what it needs to talk to Atlas. */
export function isDbConfigured(): boolean {
  return Boolean(uri);
}

export async function getDb(): Promise<Db | null> {
  if (!uri) {
    return null;
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
    global._mongoClientPromise = client.connect().catch((err: unknown) => {
      // Never cache a failed connection: the next request should try again
      // rather than inherit a permanently rejected promise.
      global._mongoClientPromise = undefined;
      throw err;
    });
  }

  const client = await global._mongoClientPromise;
  return client.db(databaseName);
}
