# Madhav Labels

A installable PWA for printing product labels from a **Retsol R220** thermal
printer (TSPL over WebUSB) for Madhav Departmental Store. Built with Next.js
(App Router) and Tailwind CSS.

## Features

- **Fuzzy POS-style search** — find items by acronym (`ad500`), substring
  (`dal500`), or ordered subsequence (`ard5`).
- **Label queue** — add catalog items or one-off custom labels, edit
  quantities inline (digits-only keypad on mobile), then print any number of
  copies.
- **WebUSB printing** — generates TSPL commands (bitmap label artwork rendered
  on a canvas, converted to 1-bit monochrome) and streams them to the printer.
- **Installable PWA** — app manifest, offline-capable service worker,
  maskable icons, and an in-app install button.

## Getting started

```bash
npm install
npm run dev        # development server
npm run build      # production build (includes typecheck)
npm run lint       # eslint
npm run icons      # regenerate PWA icons from public/512.png
```

> WebUSB requires a Chromium-based browser. Printing works over `https://` or
> `http://localhost`.

## Project structure

Feature-first organization — domain logic in `lib/`, state in `hooks/`, UI in
`components/`, and the thin Next.js surface in `app/`.

```
app/                    Next.js routes & metadata
  layout.tsx            Root layout (header, install button, SW registration)
  page.tsx              Renders <LabelPrinter />
  manifest.ts           Web app manifest (PWA installability)
  icon / apple-icon     App icons (file conventions)

components/
  printer/              The label-printing feature
    label-printer.tsx     Orchestrator (composes hooks + child components)
    item-search.tsx       Search bar + fuzzy results dropdown
    queue-list.tsx        Queued labels with quantity editing
    add-label-modal.tsx   Custom-label bottom sheet
    print-bar.tsx         Bottom bar with connect/print action
  pwa/                  Install UX
    install-button.tsx    beforeinstallprompt capture + iOS guidance
    register-sw.tsx       Service worker registration (production only)

hooks/
  use-label-queue.ts    Label queue state (add / edit / remove)
  use-web-usb.ts        WebUSB device connection & raw data transfer

lib/
  catalog.ts            Item catalog + StoreItem / QueueItem types
  search.ts             Fuzzy search scoring
  format.ts             Shared formatting helpers
  printer/
    index.ts              Public surface
    tspl/                 TSPL generation
      constants.ts          Store details, label geometry, fonts
      date.ts               Best-before calculation, date formatting
      draw-label.ts         Canvas label artwork
      label-bitmap.ts       Canvas → 1-bit mono bitmap
      generate.ts           Print-job command stream

public/                 Static assets (icons, service worker)
  sw.js                 Offline-first service worker
scripts/
  prepare-pwa-assets.mjs  Regenerates PWA icon assets (npm run icons)
```

## Printing notes

- Labels are rendered to a 600×400 px canvas (75×50 mm at 203 DPI) matching
  the store's label stock.
- Best-before dates are calculated from shelf life and clamp to the previous
  day, mirroring the original Python reference implementation.
- The store's static label content (packer registration, address, customer
  care) lives in `lib/printer/tspl/constants.ts`.
