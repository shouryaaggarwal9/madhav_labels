"use client";

import { useState, useSyncExternalStore } from "react";

import {
  getServerSyncStatus,
  getSyncStatus,
  storeSyncCode,
  subscribeSyncStatus,
  verifySyncCode,
} from "@/lib/sync/client";

/**
 * Non-blocking sync state. A locked or unreachable server is a strip above the
 * print bar, never a modal: the queue and the printer work either way.
 */
export function SyncBanner() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getServerSyncStatus);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (status !== "needs-code" && status !== "paused") {
    return null;
  }

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || checking) return;

    setChecking(true);
    setError(null);
    const result = await verifySyncCode(trimmed);
    setChecking(false);

    if (result === "ok") {
      storeSyncCode(trimmed);
      setCode("");
      return;
    }
    setError(result === "invalid" ? "That code was not accepted." : "Could not reach the server.");
  };

  return (
    <div className="absolute bottom-32 left-3 right-3 z-40">
      {status === "needs-code" ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          <p className="px-4 pt-3 text-xs font-bold text-slate-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            Turn on sync
          </p>
          <form onSubmit={handleUnlock} className="px-4 pb-4 pt-2 space-y-2">
            <p className="text-xs text-slate-500">
              Enter the shop&apos;s sync code once on this device. Printing works without it.
            </p>
            <input
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Sync code"
              className="w-full h-11 px-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {error && <p className="text-xs font-bold text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={!code.trim() || checking}
              className="w-full h-11 bg-blue-600 disabled:bg-slate-300 text-white font-bold rounded-lg active:scale-[0.98] disabled:active:scale-100 transition-all"
            >
              {checking ? "Checking…" : "Unlock sync"}
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-4 py-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <p className="text-xs font-bold text-slate-600">
            Offline — printing works, sync paused
          </p>
        </div>
      )}
    </div>
  );
}
