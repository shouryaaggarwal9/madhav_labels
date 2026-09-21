"use client";

import { useCallback, useState } from "react";

/**
 * Low-level WebUSB client for the label printer.
 *
 * The Retsol R220 is a USB CDC printer: we claim the first interface and blast
 * raw TSPL bytes at its OUT endpoint. All errors surface as human-readable
 * strings so callers can render them directly.
 */
export function useWebUsb() {
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      if (!navigator.usb) {
        throw new Error("WebUSB is not supported in this browser. Use Chrome.");
      }

      // No vendor/product filter: any paired printer is accepted.
      const selected = await navigator.usb.requestDevice({ filters: [] });
      await selected.open();

      if (selected.configuration === null) {
        await selected.selectConfiguration(1);
      }

      await selected.claimInterface(0);
      setDevice(selected);
      setError(null);
    } catch (err) {
      console.error("USB connection error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to printer");
    }
  }, []);

  const print = useCallback(
    async (data: Uint8Array<ArrayBuffer>) => {
      if (!device) {
        setError("No printer connected");
        return;
      }

      setIsPrinting(true);
      setError(null);

      try {
        const endpoints = device.configuration?.interfaces[0]?.alternate.endpoints ?? [];
        const outEndpoint = endpoints.find((endpoint) => endpoint.direction === "out");
        if (!outEndpoint) {
          throw new Error("Could not find a valid USB output endpoint.");
        }

        await device.transferOut(outEndpoint.endpointNumber, data);
      } catch (err) {
        console.error("Printing error:", err);
        setError(err instanceof Error ? err.message : "Failed to print");
      } finally {
        setIsPrinting(false);
      }
    },
    [device],
  );

  return { device, isPrinting, error, connect, print } as const;
}
