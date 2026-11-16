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
- **Cross-device sync (optional)** — the list and prices live in MongoDB Atlas
  when configured, so the store can build a list and the warehouse can print
  it. Without a database the app runs exactly as it always did, on localStorage.

## Prices

Prices are permanent when sync is configured: tap the pencil next to any search
result, change the MRP, and save. The change is written to Atlas and reaches
every device, including labels already in a queue (labels always print the
latest catalog price).

`lib/catalog.ts` is the **seed** list. It is inserted into an empty database and
never overwrites a price that was edited in the app, so editing a price there
has no effect once the item exists in Atlas. Use it to add genuinely new items
or to seed a fresh database.

## Cross-device sync setup

1. Create a free MongoDB Atlas cluster and a database user with read/write.
2. Add these to `.env.local` for development and to Vercel for production
   (Project → Settings → Environment Variables). See `.env.example`:
   - `MONGODB_URI` — the `mongodb+srv://…` connection string
   - `MONGODB_DB` — defaults to `madhav_labels`
   - `SYNC_CODE` — a shared code typed once per device to unlock writes
3. Deploy, open the app on each phone, and enter the sync code once.

The browser never sees the connection string: all database access goes through
the route handlers in `app/api/`, protected by the sync code.

Sync is deliberately offline-first. localStorage renders the queue and catalog
immediately and Atlas only replaces them once a request succeeds. If Atlas is
paused or the internet drops, printing, search, queue edits and price edits keep
working; a strip above the print bar says sync is paused. Local queue edits are
pushed when the connection returns, and unsaved price edits are replayed the same
way (on the next poll, tab focus, or reconnect), so an edit made offline still
becomes permanent once the database is reachable again.

Two devices editing the same list at the same time resolve as "last tap wins".

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
  api/                  Server-only sync endpoints (MongoDB driver)
    state/route.ts        GET/PUT the shared queue
    items/route.ts        GET/PUT the catalog (permanent price edits)
  icon / apple-icon     App icons (file conventions)

components/
  printer/              The label-printing feature
    label-printer.tsx     Orchestrator (composes hooks + child components)
    item-search.tsx       Search bar + fuzzy results dropdown + price pencil
    queue-list.tsx        Queued labels with quantity editing
    add-label-modal.tsx   Custom-label bottom sheet
    edit-item-modal.tsx   Permanent item/price editor
    print-bar.tsx         Bottom bar with connect/print action
  sync/                 Sync status banner (locked / offline)
  pwa/                  Install UX
    install-button.tsx    beforeinstallprompt capture + iOS guidance
    register-sw.tsx       Service worker registration (production only)

hooks/
  use-label-queue.ts    Label queue state + Atlas mirroring
  use-catalog.ts        Catalog (seed → cache → Atlas) + price editing
  use-web-usb.ts        WebUSB device connection & raw data transfer

lib/
  catalog.ts            Seed catalog + StoreItem / QueueItem types
  db.ts                 Cached MongoDB client (server-only)
  store.ts              Queue/catalog reads and writes (server-only)
  api-auth.ts           Sync-code check for route handlers
  validate.ts           Shared shape guards
  sync/client.ts        Browser-side fetch layer + sync status
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
