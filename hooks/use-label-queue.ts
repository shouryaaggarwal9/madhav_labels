"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { QueueItem, StoreItem } from "@/lib/catalog";
import {
  fetchState,
  onSyncCodeChanged,
  pushQueue,
  type RemoteState,
} from "@/lib/sync/client";
import { isQueueItem } from "@/lib/validate";

/**
 * The list is stored in localStorage so printing works with no network, and
 * mirrored to Atlas whenever the sync code and a connection are available.
 * localStorage is the fallback, never a passenger: a dead database only costs
 * sharing, not the ability to print today's order.
 */

const STORAGE_KEY = "label-queue";
const STORAGE_VERSION = 2;
const PUSH_DEBOUNCE_MS = 400;
const POLL_INTERVAL_MS = 5000;

const EMPTY_QUEUE: QueueItem[] = [];

interface QueueMeta {
  items: QueueItem[];
  /** Server revision this device last agreed with; null when never synced. */
  revision: number | null;
  /** True when local edits have not reached the server yet. */
  dirty: boolean;
}

const EMPTY_META: QueueMeta = { items: EMPTY_QUEUE, revision: null, dirty: false };

function parseStoredQueue(raw: string | null): QueueMeta {
  if (!raw) {
    return EMPTY_META;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return EMPTY_META;
    }

    const stored = parsed as {
      version?: unknown;
      items?: unknown;
      revision?: unknown;
      dirty?: unknown;
    };
    if (!Array.isArray(stored.items)) {
      return EMPTY_META;
    }

    const items = stored.items.filter(isQueueItem);

    // Version 1 predates sync. Keep the list, but treat it as unsynced so the
    // first connect pushes it rather than silently discarding it.
    if (stored.version === 1) {
      return { items, revision: null, dirty: false };
    }

    if (stored.version !== STORAGE_VERSION) {
      return EMPTY_META;
    }

    return {
      items,
      revision: typeof stored.revision === "number" ? stored.revision : null,
      dirty: stored.dirty === true,
    };
  } catch {
    // Corrupt payload - fall back to an empty queue.
    return EMPTY_META;
  }
}

// getSnapshot must return a referentially stable value for unchanged data,
// otherwise useSyncExternalStore would loop, so cache the parsed result and
// only re-parse when the raw string changes.
let cachedRaw: string | null = null;
let cachedMeta: QueueMeta = EMPTY_META;

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

function readMeta(): QueueMeta {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_META;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedMeta = parseStoredQueue(raw);
  }
  return cachedMeta;
}

function getSnapshot(): QueueItem[] {
  return readMeta().items;
}

function getServerSnapshot(): QueueItem[] {
  return EMPTY_QUEUE;
}

function writeMeta(items: QueueItem[], revision: number | null, dirty: boolean): void {
  const payload = {
    version: STORAGE_VERSION,
    items,
    revision,
    dirty,
  };
  const raw = JSON.stringify(payload);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    cachedMeta = { items, revision, dirty };
  } catch {
    // Quota exceeded or storage blocked - persistence is best-effort only.
    cachedRaw = null;
  }
  emit();
}

function sameItems(a: readonly QueueItem[], b: readonly QueueItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* -------------------------------------------------------------------------- */
/* Sync                                                                        */
/* -------------------------------------------------------------------------- */

let pushTimer: number | null = null;
let pollTimer: number | null = null;
let pushing = false;
let connected = 0;

function schedulePush(): void {
  if (pushTimer !== null) {
    window.clearTimeout(pushTimer);
  }
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, PUSH_DEBOUNCE_MS);
}

/** Records a server revision without discarding edits made while the push ran. */
function settle(pushedItems: readonly QueueItem[], revision: number): void {
  const current = readMeta();
  if (sameItems(current.items, pushedItems)) {
    writeMeta(current.items, revision, false);
    return;
  }
  // Someone tapped while the request was in flight; keep the newer list and
  // push it on the next tick.
  writeMeta(current.items, revision, true);
  schedulePush();
}

async function pushNow(): Promise<void> {
  if (pushing) {
    return;
  }
  pushing = true;

  try {
    const local = readMeta();
    const result = await pushQueue(local.items, local.revision ?? 0);

    if (result.kind === "ok") {
      settle(local.items, result.revision);
      return;
    }

    if (result.kind === "conflict") {
      // Last tap wins: resend this device's list against the revision the
      // server just reported. If that conflicts too, adopt the server list
      // rather than looping.
      const retry = await pushQueue(local.items, result.state.revision);
      if (retry.kind === "ok") {
        settle(local.items, retry.revision);
      } else if (retry.kind === "conflict") {
        adopt(retry.state);
      } else {
        schedulePush();
      }
      return;
    }

    if (result.kind === "failed") {
      const current = readMeta();
      if (current.dirty) {
        schedulePush();
      }
    }
  } finally {
    pushing = false;
  }
}

function adopt(remote: RemoteState): void {
  writeMeta(remote.queue, remote.revision, false);
}

async function refresh(initial: boolean): Promise<void> {
  const result = await fetchState();
  if (result.kind !== "ok") {
    return;
  }

  const remote = result.data;
  const local = readMeta();

  if (initial) {
    const isUnseededServer =
      local.revision === null &&
      remote.revision === 0 &&
      remote.queue.length === 0 &&
      local.items.length > 0;

    if (isUnseededServer) {
      // An empty server must not wipe a list built before sync existed: the
      // device that already has the order is the source of truth.
      writeMeta(local.items, remote.revision, true);
      void pushNow();
      return;
    }

    if (local.dirty) {
      void pushNow();
      return;
    }

    adopt(remote);
    return;
  }

  if (local.dirty) {
    void pushNow();
    return;
  }

  if (local.revision !== remote.revision) {
    adopt(remote);
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    void refresh(false);
  }
}

/**
 * Starts mirroring the queue. Idempotent: React StrictMode mounts effects twice
 * in development, and a second connection must not start a second poll loop.
 */
export function connectQueueSync(): () => void {
  connected += 1;

  if (connected === 1) {
    void refresh(true);
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh(false);
      }
    }, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  // Re-check as soon as a code is entered instead of waiting for the next poll.
  const offCodeChange = onSyncCodeChanged(() => {
    void refresh(true);
  });

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    offCodeChange();
    connected -= 1;
    if (connected === 0) {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Public hook                                                                 */
/* -------------------------------------------------------------------------- */

/** State + actions for the label queue being prepared for printing. */
export function useLabelQueue() {
  const queue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Adds an item, or bumps its quantity if it is already queued. */
  const add = useCallback((item: StoreItem) => {
    const meta = readMeta();
    const existing = meta.items.find((queued) => queued.id === item.id);
    const next = existing
      ? meta.items.map((queued) =>
          queued.id === item.id ? { ...queued, quantity: queued.quantity + 1 } : queued,
        )
      : [...meta.items, { ...item, quantity: 1 }];
    writeMeta(next, meta.revision, true);
    schedulePush();
  }, []);

  /** Adjusts quantity by a delta, clamped to a minimum of 1. */
  const updateQuantity = useCallback((id: string, delta: number) => {
    const meta = readMeta();
    const next = meta.items.map((queued) =>
      queued.id === id ? { ...queued, quantity: Math.max(1, queued.quantity + delta) } : queued,
    );
    writeMeta(next, meta.revision, true);
    schedulePush();
  }, []);

  /** Sets the quantity directly, clamped to a minimum of 1. */
  const setQuantity = useCallback((id: string, quantity: number) => {
    const meta = readMeta();
    const next = meta.items.map((queued) =>
      queued.id === id ? { ...queued, quantity: Math.max(1, quantity) } : queued,
    );
    writeMeta(next, meta.revision, true);
    schedulePush();
  }, []);

  const remove = useCallback((id: string) => {
    const meta = readMeta();
    writeMeta(
      meta.items.filter((queued) => queued.id !== id),
      meta.revision,
      true,
    );
    schedulePush();
  }, []);

  const clear = useCallback(() => {
    const meta = readMeta();
    if (pushTimer !== null) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
    }
    writeMeta(EMPTY_QUEUE, meta.revision, true);
    void pushNow();
  }, []);

  return { queue, add, updateQuantity, setQuantity, remove, clear } as const;
}
