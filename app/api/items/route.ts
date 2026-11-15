import { NextResponse } from "next/server";

import { isAuthorized, isSyncConfigured } from "@/lib/api-auth";
import { catalog } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { ensureSeeded, readItems, saveItem } from "@/lib/store";
import { isStoreItem } from "@/lib/validate";

export const dynamic = "force-dynamic";

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
    return NextResponse.json(await readItems(db));
  } catch (err) {
    console.error("Catalog read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/** Permanently updates one item. Used by the pencil button in search. */
export async function PUT(request: Request) {
  const denied = deny(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (!isStoreItem(body)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

    await saveItem(db, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Item save failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
