"use client";

import type { QueueItem, StoreItem } from "@/lib/catalog";

export const SYNC_CODE_KEY = "label-sync-code";

/** What the UI needs to know about sync, without polling internals. */
export type SyncStatus =
  | "idle" // nothing attempted yet
  | "synced" // last request succeeded
  | "needs-code" // server is configured, this device has no valid code
  | "paused" // this device has a code, but the server is unreachable
  | "unconfigured"; // server has no database or code set

const CODE_CHANGED_EVENT = "label-sync-code-changed";

let status: SyncStatus = "idle";
const statusListeners = new Set<() => void>();

function emitStatus(): void {
  for (const listener of statusListeners) {
    listener();
  }
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getServerSyncStatus(): SyncStatus {
  return "idle";
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function setSyncStatus(next: SyncStatus): void {
  if (status === next) {
    return;
  }
  status = next;
  emitStatus();
}

export function getSyncCode(): string | null {
  try {
    return window.localStorage.getItem(SYNC_CODE_KEY);
  } catch {
    return null;
  }
}

export function storeSyncCode(code: string | null): void {
  try {
    if (code) {
      window.localStorage.setItem(SYNC_CODE_KEY, code);
    } else {
      window.localStorage.removeItem(SYNC_CODE_KEY);
    }
  } catch {
    // A blocked localStorage only means sync has to be unlocked again next time.
  }
  // Hooks listen for this so a freshly entered code takes effect immediately
  // instead of waiting for the next poll.
  window.dispatchEvent(new Event(CODE_CHANGED_EVENT));
}

export function onSyncCodeChanged(listener: () => void): () => void {
  window.addEventListener(CODE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CODE_CHANGED_EVENT, listener);
}

/** A paused Atlas must never leave a request hanging forever. */
const REQUEST_TIMEOUT_MS = 6000;

export interface RemoteState {
  queue: QueueItem[];
  revision: number;
}

export type ReadResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "needs-code" }
  | { kind: "unconfigured" }
  | { kind: "paused" };

async function read<T>(path: string): Promise<ReadResult<T>> {
  const code = getSyncCode();

  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: code ? { "x-sync-code": code } : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401) {
      setSyncStatus("needs-code");
      return { kind: "needs-code" };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 503 && body?.error === "unconfigured") {
        setSyncStatus("unconfigured");
        return { kind: "unconfigured" };
      }
      // With a code stored this is worth telling the shop about; without one
      // the prompt should stay visible so the code can be retried.
      setSyncStatus(code ? "paused" : "needs-code");
      return { kind: "paused" };
    }

    setSyncStatus("synced");
    return { kind: "ok", data: (await response.json()) as T };
  } catch {
    setSyncStatus(code ? "paused" : "idle");
    return { kind: "paused" };
  }
}

export function fetchState(): Promise<ReadResult<RemoteState>> {
  return read<RemoteState>("/api/state");
}

export function fetchItems(): Promise<ReadResult<StoreItem[]>> {
  return read<StoreItem[]>("/api/items");
}

export type PushResult =
  | { kind: "ok"; revision: number }
  | { kind: "conflict"; state: RemoteState }
  | { kind: "failed" };

export async function pushQueue(queue: QueueItem[], revision: number): Promise<PushResult> {
  const code = getSyncCode();

  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(code ? { "x-sync-code": code } : {}),
      },
      body: JSON.stringify({ queue, revision }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 409) {
      setSyncStatus("synced");
      return { kind: "conflict", state: (await response.json()) as RemoteState };
    }

    if (response.status === 401) {
      setSyncStatus("needs-code");
      return { kind: "failed" };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 503 && body?.error === "unconfigured") {
        setSyncStatus("unconfigured");
      } else {
        setSyncStatus(code ? "paused" : "idle");
      }
      return { kind: "failed" };
    }

    setSyncStatus("synced");
    const body = (await response.json()) as { revision: number };
    return { kind: "ok", revision: body.revision };
  } catch {
    setSyncStatus(code ? "paused" : "idle");
    return { kind: "failed" };
  }
}

export async function saveItem(item: StoreItem): Promise<boolean> {
  const code = getSyncCode();

  try {
    const response = await fetch("/api/items", {
      method: "PUT",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(code ? { "x-sync-code": code } : {}),
      },
      body: JSON.stringify(item),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401) {
      setSyncStatus("needs-code");
      return false;
    }
    if (!response.ok) {
      setSyncStatus(code ? "paused" : "idle");
      return false;
    }

    setSyncStatus("synced");
    return true;
  } catch {
    setSyncStatus(code ? "paused" : "idle");
    return false;
  }
}

/** Checks a code without keeping it, so a wrong entry can be reported. */
export async function verifySyncCode(code: string): Promise<"ok" | "invalid" | "unavailable"> {
  try {
    const response = await fetch("/api/items", {
      cache: "no-store",
      headers: { "x-sync-code": code },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401) {
      setSyncStatus("needs-code");
      return "invalid";
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 503 && body?.error === "unconfigured") {
        setSyncStatus("unconfigured");
      } else {
        // Keep the code prompt on screen: the code has not been verified yet,
        // so hiding it would leave the shop with no way to retry.
        setSyncStatus("needs-code");
      }
      return "unavailable";
    }

    setSyncStatus("synced");
    return "ok";
  } catch {
    setSyncStatus("paused");
    return "unavailable";
  }
}
