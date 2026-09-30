# Device storage and mobile workspace

The canonical shared sidebar initializes the phone navigation, storage status,
manifest and install icons. `sw.js` owns caching; no new UI/runtime dependency is
loaded. Clinical values, warnings and calculations are unchanged.

## What is saved

Pages and successful clinical GET responses opened by the user are saved in Cache
Storage. The initial download is captured before the worker controls the page;
the current page's resources are recovered from the HTTP cache, including dynamic
scripts. No full registry or dosage download runs on install, reconnect or timers.
The clinical read allowlist covers registry search/detail, ICD, targeted doses,
protocol metadata and Medical Hub. New searches and server calculations still
require internet until that exact response has been opened and saved.

Saved reads return immediately; fresh reads do not download again for six hours.
Older clinical copies display their saved date and revalidate in the background.
ETag/Last-Modified conditional requests avoid downloading unchanged responses.
Registry **Rifresko** explicitly revalidates. Identical concurrent reads share one
network operation. Dosage keys preserve the entire sorted query.

Static resources use exact URLs, including versions. HTML and data caches have
stable device namespaces across releases. A worker update keeps active pages and
scroll position intact; it does not force a reload. A fresh HTML response replaces
the saved page in the background. Modified shared CSS, sidebar and registry assets
have new version parameters. Install requests persistent storage where supported.
The browser or device can still evict storage or the user can clear it.

## Account boundaries

Offline boot uses a sanitized last-verified session for at most eight hours. It
contains no access/refresh token or administrative authorization and never grants
access to server operations. An actual HTTP 401/403 is never replaced by an offline
session. Account changes, successful logout and revocation clear saved clinical
reads, pages, documents and the offline session. An in-flight read after logout
cannot repopulate the cache. First-download messages are matched to the verified
account. Patient/account APIs, auth scope checks and writes are not cached/replayed.
Clinical response storage is bounded to 400 entries and PDF storage to 16 documents.
Storage errors preserve successful online reads and report limited storage.

## Verification

`pnpm test:device-offline` exercises request deduplication, complete dosage key
isolation, conditional refresh, offline lease expiry, account changes, revocation,
logout races and token-free storage. Its real Chromium browser test opens the
first page, checks a local read under a three-second network delay (<500 ms),
asserts no duplicate download, explicitly refreshes, disconnects the network,
reloads the registry, opens saved detail, checks missing-data behavior and clears
storage on revocation/logout. CI repeats the browser test in WebKit.

`pnpm test:premium-ui` checks 90 route/viewport cases from 320–1920 px, mobile
navigation, touch targets, long medicine names, drawers, keyboard focus, search
and public pages. Raster app icons are deterministic exports of the existing
approved DRx mark, with separate any/maskable assets and an Apple touch icon.
