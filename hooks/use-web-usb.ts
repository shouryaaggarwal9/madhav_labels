"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** localStorage key holding the identity of the last authorised printer. */
const IDENTITY_KEY = "label-printer-identity";

interface PrinterIdentity {
  vendorId: number;
  productId: number;
}

function readIdentity(): PrinterIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const identity = parsed as Partial<PrinterIdentity>;
    if (typeof identity.vendorId !== "number" || typeof identity.productId !== "number") {
      return null;
    }
    return { vendorId: identity.vendorId, productId: identity.productId };
  } catch {
    return null;
  }
}

function rememberIdentity(device: USBDevice): void {
  try {
    const identity: PrinterIdentity = {
      vendorId: device.vendorId,
      productId: device.productId,
    };
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // best-effort only
  }
}

function isSameDevice(a: USBDevice, b: USBDevice): boolean {
  return a === b || (a.vendorId === b.vendorId && a.productId === b.productId);
}

function matchesIdentity(device: USBDevice, identity: PrinterIdentity): boolean {
  return device.vendorId === identity.vendorId && device.productId === identity.productId;
}

/**
 * Low-level WebUSB client for the label printer.
 *
 * The Retsol R220 is a USB CDC printer: we claim the first interface and blast
 * raw TSPL bytes at its OUT endpoint. All errors surface as human-readable
 * strings so callers can render them directly.
 *
 * Once the browser has granted this origin access to the printer, the device is
 * re-attached automatically on every load via `getDevices()`, so the user only
 * has to pick the printer once. A `disconnect` event (e.g. a loose cable) drops
 * the device back to a clean, retryable state instead of leaving a stale handle.
 */
export function useWebUsb() {
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs let event listeners and cleanup observe live values without
  // re-subscribing, and let us block a double print synchronously.
  const deviceRef = useRef<USBDevice | null>(null);
  const printingRef = useRef(false);
  const restoringRef = useRef(false);
  const warnedRef = useRef(false);

  const applyDevice = useCallback((next: USBDevice | null) => {
    deviceRef.current = next;
    setDevice(next);
  }, []);

  /** Opens (if needed) and claims the printer's first interface. */
  const openAndClaim = useCallback(async (target: USBDevice) => {
    if (!target.opened) {
      await target.open();
    }
    if (target.configuration === null) {
      await target.selectConfiguration(1);
    }
    await target.claimInterface(0);
  }, []);

  /**
   * A freshly (re)plugged printer is sometimes not ready the instant the
   * browser reports it, so `open()` can reject with a transient error. Retry a
   * few times before giving up - the next `connect` event or poll tick will
   * try again anyway.
   */
  const openAndClaimWithRetry = useCallback(
    async (target: USBDevice, attempts = 4) => {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await openAndClaim(target);
          return;
        } catch (err) {
          if (attempt === attempts) {
            throw err;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
      }
    },
    [openAndClaim],
  );

  /** Best-effort release of a device we are finished with. */
  const closeDevice = useCallback(async (target: USBDevice) => {
    try {
      if (target.opened) {
        try {
          await target.releaseInterface(0);
        } catch {
          // Interface may not be claimed - ignore.
        }
        await target.close();
      }
    } catch {
      // Device already gone - ignore.
    }
  }, []);

  /**
   * Re-attaches to a printer this origin is already authorised to use, so the
   * app reconnects on every launch without showing the device chooser.
   * Resolves to true when a printer is attached.
   */
  const restore = useCallback(async (): Promise<boolean> => {
    if (!navigator.usb || deviceRef.current || restoringRef.current) {
      return false;
    }
    restoringRef.current = true;
    try {
      const identity = readIdentity();
      const devices = await navigator.usb.getDevices();
      const target =
        devices.find((candidate) => identity !== null && matchesIdentity(candidate, identity)) ??
        (devices.length === 1 ? devices[0] : undefined);

      if (!target) {
        return false;
      }
      await openAndClaimWithRetry(target);
      rememberIdentity(target);
      applyDevice(target);
      setError(null);
      warnedRef.current = false;
      return true;
    } catch (err) {
      if (!warnedRef.current) {
        console.warn("Automatic printer reconnect failed:", err);
        warnedRef.current = true;
      }
      return false;
    } finally {
      restoringRef.current = false;
    }
  }, [applyDevice, openAndClaimWithRetry]);

  // Auto-attach on load, and keep tabs listening for the cable being
  // unplugged (disconnect) or plugged back in (connect).
  useEffect(() => {
    if (!navigator.usb) {
      return;
    }
    const usb = navigator.usb;

    const handleDisconnect = (event: USBConnectionEvent) => {
      const current = deviceRef.current;
      if (current && isSameDevice(event.device, current)) {
        applyDevice(null);
        setError("Printer disconnected. Check the cable, then print again.");
      }
    };

    const handleConnect = () => {
      // restore() re-queries getDevices() itself, so there is no need to trust
      // event.device here - that keeps reconnection working even when a device
      // re-enumerates with a different identity after being replugged.
      if (!deviceRef.current) {
        void restore();
      }
    };

    usb.addEventListener("disconnect", handleDisconnect);
    usb.addEventListener("connect", handleConnect);
    // restore() only updates state after `await getDevices()` resolves, so this
    // is a subscription to an external device rather than a synchronous
    // setState render. The rule's heuristic cannot see across the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();

    return () => {
      usb.removeEventListener("disconnect", handleDisconnect);
      usb.removeEventListener("connect", handleConnect);
      const current = deviceRef.current;
      deviceRef.current = null;
      if (current) {
        void closeDevice(current);
      }
    };
  }, [applyDevice, closeDevice, restore]);

  // Safety net: `connect` events can be missed (and a freshly replugged device
  // may not be ready yet), so while we have no printer we retry on a slow
  // interval. Replug the cable and the printer reattaches on its own, with no
  // need to open the device chooser again.
  useEffect(() => {
    if (device) {
      return;
    }
    const timer = window.setInterval(() => {
      void restore();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [device, restore]);

  const connect = useCallback(async () => {
    try {
      if (!navigator.usb) {
        throw new Error("WebUSB is not supported in this browser. Use Chrome.");
      }

      // Drop any previously opened printer so we never leak a claimed interface.
      const previous = deviceRef.current;
      if (previous) {
        applyDevice(null);
        await closeDevice(previous);
      }

      // The browser usually still holds the permission we were granted earlier,
      // so try a silent reconnect first and only fall back to the chooser if
      // that genuinely is not possible.
      if (await restore()) {
        return;
      }

      // No vendor/product filter: any paired printer is accepted.
      const selected = await navigator.usb.requestDevice({ filters: [] });
      await openAndClaimWithRetry(selected);
      rememberIdentity(selected);
      applyDevice(selected);
      setError(null);
    } catch (err) {
      console.error("USB connection error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to printer");
    }
  }, [applyDevice, closeDevice, openAndClaimWithRetry, restore]);

  const print = useCallback(
    async (data: Uint8Array<ArrayBuffer>) => {
      if (!device) {
        setError("No printer connected");
        return;
      }
      // Guard against a double submit landing before `isPrinting` re-renders.
      if (printingRef.current) {
        return;
      }

      printingRef.current = true;
      setIsPrinting(true);
      setError(null);

      try {
        const endpoints = device.configuration?.interfaces[0]?.alternate.endpoints ?? [];
        const outEndpoint = endpoints.find((endpoint) => endpoint.direction === "out");
        if (!outEndpoint) {
          throw new Error("Could not find a valid USB output endpoint.");
        }

        const result = await device.transferOut(outEndpoint.endpointNumber, data);
        if (result.status !== "ok" || result.bytesWritten !== data.byteLength) {
          throw new Error(
            "The printer did not accept the full label data. Check the cable and printer, then print again.",
          );
        }
      } catch (err) {
        console.error("Printing error:", err);
        setError(err instanceof Error ? err.message : "Failed to print");
      } finally {
        printingRef.current = false;
        setIsPrinting(false);
      }
    },
    [device],
  );

  return { device, isPrinting, error, connect, print, setError } as const;
}
