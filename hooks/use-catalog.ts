"use client";

import { useCallback, useSyncExternalStore } from "react";

import { catalog as staticCatalog, type StoreItem } from "@/lib/catalog";
import { fetchItems, onSyncCodeChanged, saveItem } from "@/lib/sync/client";
import { isStoreItem } from "@/lib/validate";

/**
 * The catalog is local-first. The built-in list renders immediately, the last
 * confirmed copy from Atlas replaces it when available, and a slow or paused
 * database only ever costs freshness — never search or printing.
 */

const CACHE_KEY = "label-catalog";
const CACHE_VERSION = 1;

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
    const result = await fetchItems();
    if (!active || result.kind !== "ok") return;

    const remote = result.data.filter(isStoreItem);
    if (remote.length === 0) return;

    items = merge(remote);
    writeCachedCatalog(remote);
    emit();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void load();
  };

  void load();
  document.addEventListener("visibilitychange", onVisible);
  const offCodeChange = onSyncCodeChanged(() => {
    void load();
  });

  return () => {
    active = false;
    document.removeEventListener("visibilitychange", onVisible);
    offCodeChange();
  };
}

/** Catalog plus the permanent price-edit action. */
export function useCatalog() {
  const catalog = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * Writes a permanent change and reflects it locally straight away. The local
   * copy is written before the network call so a price edit is never lost to a
   * paused database; the server becomes authoritative again on the next
   * successful load.
   */
  const updateItem = useCallback(async (item: StoreItem) => {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    items =
      index >= 0
        ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
        : [...items, item];
    writeCachedCatalog(items);
    emit();

    const saved = await saveItem(item);
    if (!saved) {
      console.warn("Price kept on this device; sync will retry on the next load.");
    }
  }, []);

  return { catalog, updateItem } as const;
}
