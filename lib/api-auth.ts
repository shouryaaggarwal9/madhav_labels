import { timingSafeEqual } from "node:crypto";

/**
 * Sync needs both a database and a shared code. Missing either one is treated
 * as "not configured": the app keeps printing from localStorage and the API
 * refuses to touch the database, so a half-finished setup can never expose an
 * open write endpoint.
 */
export function isSyncConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim() && process.env.SYNC_CODE?.trim());
}

export function isAuthorized(request: Request): boolean {
  const expected = process.env.SYNC_CODE?.trim() ?? "";
  const provided = request.headers.get("x-sync-code")?.trim() ?? "";
  if (!expected || !provided) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}
