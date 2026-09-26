"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { QueueItem, StoreItem } from "@/lib/catalog";

const STORAGE_KEY = "label-queue";
const STORAGE_VERSION = 1;

interface StoredQueue {
  version: number;
  items: QueueItem[];
}

const EMPTY_QUEUE: QueueItem[] = [];

function isQueueItem(value: unknown): value is QueueItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.weight === "number" &&
    typeof item.mrp === "number" &&
    typeof item.shelfLife === "number" &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1
  );
}

function parseStoredQueue(raw: string | null): QueueItem[] {
  if (!raw) {
    return EMPTY_QUEUE;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return EMPTY_QUEUE;
    }
    const stored = parsed as Partial<StoredQueue>;
    if (stored.version !== STORAGE_VERSION || !Array.isArray(stored.items)) {
      return EMPTY_QUEUE;
    }
    const items = stored.items.filter(isQueueItem);
    return items.length > 0 ? items : EMPTY_QUEUE;
  } catch {
    // Corrupt payload - fall back to an empty queue.
    return EMPTY_QUEUE;
  }
}

/*
 * localStorage-backed external store. `useSyncExternalStore` reads it without a
 * hydration mismatch (it uses an empty server snapshot) and re-renders on
 * change without a cascading setState-in-effect.
 */

// getSnapshot must return a referentially stable value for unchanged data,
// otherwise useSyncExternalStore would loop, so cache the parsed result and
// only re-parse when the raw string changes.
let cachedRaw: string | null = null;
let cachedItems: QueueItem[] = EMPTY_QUEUE;

const listeners = new Set<() => void>();

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

function getSnapshot(): QueueItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_QUEUE;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = parseStoredQueue(raw);
  }
  return cachedItems;
}

function getServerSnapshot(): QueueItem[] {
  return EMPTY_QUEUE;
}

function setStoredQueue(items: QueueItem[]): void {
  try {
    const payload: StoredQueue = { version: STORAGE_VERSION, items };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage blocked - persistence is best-effort only.
  }
  emit();
}

/** State + actions for the label queue being prepared for printing. */
export function useLabelQueue() {
  const queue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Adds an item, or bumps its quantity if it is already queued. */
  const add = useCallback((item: StoreItem) => {
    const prev = getSnapshot();
    const existing = prev.find((queued) => queued.id === item.id);
    const next = existing
      ? prev.map((queued) =>
          queued.id === item.id ? { ...queued, quantity: queued.quantity + 1 } : queued,
        )
      : [...prev, { ...item, quantity: 1 }];
    setStoredQueue(next);
  }, []);

  /** Adjusts quantity by a delta, clamped to a minimum of 1. */
  const updateQuantity = useCallback((id: string, delta: number) => {
    const next = getSnapshot().map((queued) =>
      queued.id === id ? { ...queued, quantity: Math.max(1, queued.quantity + delta) } : queued,
    );
    setStoredQueue(next);
  }, []);

  /** Sets the quantity directly, clamped to a minimum of 1. */
  const setQuantity = useCallback((id: string, quantity: number) => {
    const next = getSnapshot().map((queued) =>
      queued.id === id ? { ...queued, quantity: Math.max(1, quantity) } : queued,
    );
    setStoredQueue(next);
  }, []);

  const remove = useCallback((id: string) => {
    setStoredQueue(
      getSnapshot().filter((queued) => queued.id !== id),
    );
  }, []);

  const clear = useCallback(() => setStoredQueue(EMPTY_QUEUE), []);

  return { queue, add, updateQuantity, setQuantity, remove, clear } as const;
}
