"use client";

import { useCallback, useSyncExternalStore } from "react";

import { catalog as staticCatalog, type StoreItem } from "@/lib/catalog";
import { fetchItems, getSyncCode, onSyncCodeChanged, saveItem } from "@/lib/sync/client";
import { isStoreItem } from "@/lib/validate";

/**
 * The catalog is local-first. The built-in list renders immediately, the last
 * confirmed copy from Atlas replaces it when available, and a slow or paused
 * database only ever costs freshness — never search or printing.
 */

const CACHE_KEY = "label-catalog";
const CACHE_VERSION = 1;

/**
 * Price edits that have not reached Atlas yet. A tap made while the database
 * is unreachable must not be silently undone by the next successful load, so
 * unsaved edits are kept here and replayed, the same way the queue retries its
 * own `dirty` list.
 */
const PENDING_KEY = "label-catalog-pending";
const PENDING_VERSION = 1;
const RETRY_INTERVAL_MS = 5000;

const listeners = new Set<() => void>();

let items: StoreItem[] = staticCatalog;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StoreItem[] {
  return items;
}

/** The build-time list keeps server and client markup identical. */
function getServerSnapshot(): StoreItem[] {
  return staticCatalog;
}

function readCachedCatalog(): StoreItem[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const stored = parsed as { version?: unknown; items?: unknown };
    if (stored.version !== CACHE_VERSION || !Array.isArray(stored.items)) return null;
    const cached = stored.items.filter(isStoreItem);
    return cached.length > 0 ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedCatalog(remote: readonly StoreItem[]): void {
  if (remote.length === 0) return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: CACHE_VERSION, items: remote }),
    );
  } catch {
    // Best-effort: a full or blocked localStorage must not break sync.
  }
}

/* -------------------------------------------------------------------------- */
/* Unsaved price edits                                                         */
/* -------------------------------------------------------------------------- */

function readPending(): Map<string, StoreItem> {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return new Map();
    const stored = parsed as { version?: unknown; items?: unknown };
    if (stored.version !== PENDING_VERSION || !Array.isArray(stored.items)) {
      return new Map();
    }
    const entries = stored.items.filter(isStoreItem).map((item) => [item.id, item] as const);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function writePending(pending: Map<string, StoreItem>): void {
  try {
    if (pending.size === 0) {
      window.localStorage.removeItem(PENDING_KEY);
      return;
    }
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ version: PENDING_VERSION, items: [...pending.values()] }),
    );
  } catch {
    // A blocked localStorage only costs the retry, never the current edit.
  }
}

function sameItem(a: StoreItem, b: StoreItem): boolean {
  return (
    a.name === b.name &&
    a.mrp === b.mrp &&
    a.weight === b.weight &&
    a.shelfLife === b.shelfLife
  );
}

let flushing = false;

/**
 * Replays unsaved price edits. Each successful write clears its own entry; a
 * failed one stays queued for the next tick, focus, or reconnect. Nothing here
 * blocks search or printing.
 */
async function flushPending(): Promise<void> {
  if (flushing) return;

  const pending = readPending();
  if (pending.size === 0) return;
  // Without a code the write can only 401; keep the edits and wait for unlock.
  if (!getSyncCode()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  flushing = true;
  try {
    for (const item of pending.values()) {
      const saved = await saveItem(item);
      if (!saved) return;

      const current = readPending();
      const queued = current.get(item.id);
      // Only clear the entry we actually sent; a newer tap on the same item
      // must be pushed separately rather than considered saved.
      if (queued && sameItem(queued, item)) {
        current.delete(item.id);
        writePending(current);
      }
    }
  } finally {
    flushing = false;
  }
}

/** Lets the server win, except for edits that never reached it. */
function overlayPending(remote: StoreItem[]): StoreItem[] {
  const pending = readPending();
  if (pending.size === 0) return remote;

  const seen = new Set<string>();
  const merged = remote.map((item) => {
    const unsaved = pending.get(item.id);
    if (!unsaved) return item;
    seen.add(item.id);
    return unsaved;
  });
  for (const [id, unsaved] of pending) {
    if (!seen.has(id)) merged.push(unsaved);
  }
  return merged;
}


/**
 * Overlays database rows onto the seed list. Rows for ids we don't ship
 * (custom labels) are kept too, so they show up in search.
 */
function merge(remote: readonly StoreItem[]): StoreItem[] {
  if (remote.length === 0) return staticCatalog;

  const byId = new Map(remote.map((item) => [item.id, item]));
  const merged = staticCatalog.map((item) => byId.get(item.id) ?? item);
  const extras = remote.filter((item) => !staticCatalog.some((seed) => seed.id === item.id));
  return [...merged, ...extras];
}

/** Starts the initial fetch and a refresh whenever the tab regains focus. */
export function connectCatalogSync(): () => void {
  const cached = readCachedCatalog();
  if (cached) {
    items = cached;
    emit();
  }

  let active = true;

  const load = async () => {
    // Save queued edits first so the response we are about to adopt is the one
    // that already contains them.
    await flushPending();

    const result = await fetchItems();
    if (!active || result.kind !== "ok") return;

    const remote = result.data.filter(isStoreItem);
    if (remote.length === 0) return;

    const authoritative = overlayPending(remote);
    items = merge(authoritative);
    writeCachedCatalog(authoritative);
    emit();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void load();
  };

  const onOnline = () => {
    void load();
  };

  // A paused database must not cost a price edit: retry while the tab is open.
  const retryTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (readPending().size === 0) return;
    void flushPending();
  }, RETRY_INTERVAL_MS);

  void load();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const offCodeChange = onSyncCodeChanged(() => {
    void load();
  });

  return () => {
    active = false;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.clearInterval(retryTimer);
    offCodeChange();
  };
}

/** Catalog plus the permanent price-edit action. */
export function useCatalog() {
  const catalog = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * Reflects the change locally at once, then queues it for Atlas. Keeping the
   * edit in the pending list means a failed write is retried instead of being
   * quietly replaced by the old price on the next load.
   */
  const updateItem = useCallback(async (item: StoreItem) => {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    items =
      index >= 0
        ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
        : [...items, item];
    writeCachedCatalog(items);
    emit();

    const pending = readPending();
    pending.set(item.id, item);
    writePending(pending);

    await flushPending();
    if (readPending().has(item.id)) {
      console.warn("Price saved on this device; it will sync when the connection returns.");
    }
  }, []);

  return { catalog, updateItem } as const;
}
