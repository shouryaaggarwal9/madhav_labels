import { NextResponse } from "next/server";

import { isAuthorized, isSyncConfigured } from "@/lib/api-auth";
import { catalog } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { ensureSeeded, readQueue, writeQueue } from "@/lib/store";
import { isQueueItem } from "@/lib/validate";

// The list is per-shop state, never a cacheable response.
export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

/** Shared guard: configuration first, then the sync code. */
function deny(request: Request): NextResponse | null {
  if (!isSyncConfigured()) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = deny(request);
  if (denied) return denied;

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

    await ensureSeeded(db, catalog);
    return NextResponse.json(await readQueue(db));
  } catch (err) {
    console.error("Queue read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const denied = deny(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const payload = body as { queue?: unknown; revision?: unknown } | null;
  const queue = payload?.queue;
  const revision = payload?.revision;

  if (
    !Array.isArray(queue) ||
    queue.length > MAX_ITEMS ||
    !queue.every(isQueueItem) ||
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

    const result = await writeQueue(db, queue, revision);
    if (result.kind === "conflict") {
      return NextResponse.json(
        { queue: result.queue, revision: result.revision },
        { status: 409 },
      );
    }
    return NextResponse.json({ revision: result.revision });
  } catch (err) {
    console.error("Queue write failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
