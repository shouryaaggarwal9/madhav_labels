import type { Db } from "mongodb";

import type { QueueItem, StoreItem } from "@/lib/catalog";
import { isQueueItem, isStoreItem } from "@/lib/validate";

const QUEUE_ID = "queue";

interface QueueDoc {
  _id: string;
  items: QueueItem[];
  revision: number;
  updatedAt: Date;
}

interface ItemDoc extends StoreItem {
  _id: string;
}

/**
 * Pushes the built-in catalog into an empty database. `$setOnInsert` makes this
 * safe to run on every cold start: ids that already exist keep their edited
 * price, so a redeploy never undoes a price change made in the app.
 */
let seedPromise: Promise<void> | null = null;

export function ensureSeeded(db: Db, catalog: readonly StoreItem[]): Promise<void> {
  if (!seedPromise) {
    seedPromise = db
      .collection<ItemDoc>("items")
      .bulkWrite(
        catalog.map((item) => ({
          updateOne: {
            filter: { _id: item.id },
            update: { $setOnInsert: { ...item } },
            upsert: true,
          },
        })),
        { ordered: false },
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        // Let the next request retry rather than caching the failure forever.
        seedPromise = null;
        throw err;
      });
  }
  return seedPromise;
}

export async function readItems(db: Db): Promise<StoreItem[]> {
  const docs = await db
    .collection<ItemDoc>("items")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return docs.filter(isStoreItem);
}

export async function saveItem(db: Db, item: StoreItem): Promise<void> {
  await db
    .collection<ItemDoc>("items")
    .updateOne({ _id: item.id }, { $set: { ...item } }, { upsert: true });
}

export async function readQueue(db: Db): Promise<{ queue: QueueItem[]; revision: number }> {
  const collection = db.collection<QueueDoc>("state");
  const doc = await collection.findOne({ _id: QUEUE_ID });

  if (!doc) {
    // Two devices can hit a brand-new project at the same moment; the losing
    // upsert throws a duplicate-key error, which simply means the row now
    // exists and should be re-read instead of failing the request.
    await collection
      .updateOne(
        { _id: QUEUE_ID },
        { $setOnInsert: { items: [], revision: 0, updatedAt: new Date() } },
        { upsert: true },
      )
      .catch((err: unknown) => {
        if ((err as { code?: number }).code !== 11000) {
          throw err;
        }
      });

    const created = await collection.findOne({ _id: QUEUE_ID });
    return created
      ? { queue: created.items.filter(isQueueItem), revision: created.revision }
      : { queue: [], revision: 0 };
  }

  return { queue: doc.items.filter(isQueueItem), revision: doc.revision };
}

export type QueueWriteResult =
  | { kind: "ok"; revision: number }
  | { kind: "conflict"; queue: QueueItem[]; revision: number };

/**
 * Applies a whole-list write only when the caller's revision is current. A
 * mismatch returns the server's list so the client can decide: retry with the
 * newer revision (last tap wins) or adopt the server list. No field-level merge
 * exists because two people editing the same list within seconds is rare, and a
 * silent half-merge would be harder to explain than "whoever tapped last wins".
 */
export async function writeQueue(
  db: Db,
  queue: QueueItem[],
  revision: number,
): Promise<QueueWriteResult> {
  const collection = db.collection<QueueDoc>("state");
  const result = await collection.updateOne(
    { _id: QUEUE_ID, revision },
    { $set: { items: queue, updatedAt: new Date() }, $inc: { revision: 1 } },
  );

  if (result.matchedCount === 0) {
    const current = await readQueue(db);
    return { kind: "conflict", ...current };
  }

  return { kind: "ok", revision: revision + 1 };
}
