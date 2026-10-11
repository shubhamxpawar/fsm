# Manifest V3 Extension Architecture

## Scope and design choices

The extension has four user-facing capabilities:

- Block a user-selected set of social-media domains.
- Run a focus timer and a kill timer (a hard stop that re-enables blocking or ends a break).
- Provide quick controls in the toolbar popup.
- Provide full configuration in an options page.

The service worker is the authority for time-based state, alarms, dynamic blocking rules, and storage changes. Pages render state and submit user intent; they do not independently decide whether a block should be active.

## Folder structure

```text
fxck-social-media/
├── manifest.json                    # MV3 manifest; declares pages, worker, permissions
├── src/
│   ├── background/
│   │   ├── service-worker.*          # Lifecycle coordinator and message router
│   │   ├── blocking-manager.*        # Dynamic Declarative Net Request rule reconciliation
│   │   ├── timer-manager.*           # Timer state transitions and alarm scheduling
│   │   ├── storage-repository.*      # Schema validation, migration, and persistence boundary
│   │   └── domain-normalizer.*       # Canonicalizes user-entered domains
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.*                   # Compact controls and state display
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html
│   │   ├── options.*                 # Domain, permission, and timer preferences
│   │   └── options.css
│   ├── blocked/
│   │   ├── blocked.html
│   │   ├── blocked.*                 # Redirect target for blocked site navigations
│   │   └── blocked.css
│   ├── shared/
│   │   ├── contracts.*               # Message names and data-shape definitions
│   │   ├── defaults.*                # Default settings and bundled content metadata
│   │   ├── time.*                    # Timestamp/duration calculations
│   │   ├── quote-content.*           # Stable index of supplied quote-image assets
│   │   └── quotes/                   # User-supplied local quote images
├── docs/
│   └── ARCHITECTURE.md               # Optional duplicate/moved final architecture document
└── tests/                            # Future unit/integration test organization
```

Use user-supplied local quote-image assets initially. This keeps the blocked-page experience reliable offline, avoids network permissions, and prevents third-party content from being injected into an extension page. A future remote-content feature should be a separate, opt-in subsystem with strict validation and caching.

## Blocked-page destination contract

Blocked navigations always redirect to the extension-owned path **`/blocked/blocked.html`**. This page is the enforcement destination and must clearly state that access is currently unavailable.

- Dynamic DNR rules match only selected external domains and only the `main_frame` resource type; they never match the `chrome-extension://` origin. Therefore the redirect target cannot match its own blocking rules or form a redirect loop.
- The manifest exposes only `/blocked/blocked.html` (and the minimum assets it requires) through `web_accessible_resources`, scoped as narrowly as Chrome permits. No options, popup, service-worker, or general extension assets are exposed.
- The page obtains current authoritative block/timer status from the service worker after loading. It selects a random valid local quote image and displays a safe fallback if the supplied content set is empty or invalid.
- The redirect does not attempt to carry the blocked URL in query parameters. This avoids leaking navigation details into extension-page history, logs, screenshots, or message payloads. The page shows a generic message such as “This site is blocked right now,” plus the active reason and remaining timer time when relevant.
- If a block condition ends while the page is open, the page updates its status through the normal state-refresh flow. It does not automatically reopen the blocked site; the user must intentionally navigate again.
- Reloading or using back/forward while blocking is still effective returns to the same blocked page. No “continue anyway,” pause, cancel, or off control is displayed for a running kill-switch timer.

## Data flow

```text
Options / Popup
        │ user intent or state request
        ▼
Service worker ── validates and normalizes ──► chrome.storage.local
        │                                             │
        ├── reconciles domain rules ──► Declarative Net Request engine
        ├── schedules/cancels ────────► chrome.alarms
        └── returns authoritative state ─────────────► requesting page

chrome.alarms event ──► Service worker ──► stored timer state + blocking rules
```

- Settings changes are written once to persistent storage, then blocking rules are reconciled from the saved canonical domain list.
- Timer state stores absolute timestamps, never a decrementing in-memory counter. Each UI calculates remaining time from `endAt`, so it stays correct after service-worker suspension, popup closure, or device sleep.
- The service worker recreates/reconciles alarms and DNR rules at startup and installation, making the extension resilient to service-worker termination.

## Message flow

All extension pages communicate with the service worker through explicit request/response messages. Each request includes a message type and payload; responses include success/failure, current revision, and the relevant state. The service worker validates sender context and payload before changing state.

| Origin | Request | Service-worker action | Result |
|---|---|---|---|
| Popup | `GET_DASHBOARD_STATE` | Reads settings, timer, and effective blocking state | Popup renders status and remaining time |
| Popup | `TOGGLE_BLOCKING` | Updates manual blocking preference and reconciles rules | Updated effective block status |
| Popup | `START_FOCUS_TIMER` | Writes absolute start/end values, creates focus alarm, reconciles rules | Active focus-timer state |
| Popup | `START_KILL_TIMER` | Writes kill-timer end value and creates kill alarm | Active kill-timer state |
| Popup | `CANCEL_TIMER` | Clears the named timer and its alarm; recalculates blocking | Updated timer state |
| Options | `SAVE_SETTINGS` | Validates settings, normalizes/deduplicates domains, writes storage, reconciles rules | Saved settings and validation feedback |
| Service worker | `TIMER_ALARM_FIRED` (internal) | Confirms timestamps, transitions timer state, updates rules | Optional state-refresh notification to open extension pages |
| Storage change | `STORAGE_CHANGED` (internal) | Reconciles stale alarms/rules when needed | All contexts refresh on next query or notification |

Use one-off messages for normal actions. A long-lived port is optional only while a visible page needs second-by-second timer updates; it is a UI convenience, not a source of truth. Pages must still refresh from stored state after reconnecting.

## Blocking and timer policy

`effectiveBlocking` is derived, not independently stored:

```text
effectiveBlocking = manualBlockingEnabled OR focusTimer.active OR killTimer.active
```

### Selected-domain policy

Users enter a bare hostname only, such as `instagram.com`. The extension trims and lowercases it before saving. It rejects protocols, paths, query strings, fragments, ports, credentials, IP addresses, `localhost`, single-label names, malformed labels, and incomplete top-level domains. Internationalized domains must be entered in their ASCII/Punycode form.

Selecting a hostname blocks that hostname and all of its subdomains. Therefore `facebook.com` includes `www.facebook.com` and `m.facebook.com`; selecting `www.facebook.com` affects only that host and its descendants. Domain matching uses a DNR domain anchor, so a selection never matches a lookalike such as `notfacebook.com`. The domain list is deduplicated after normalization.

This policy treats the kill timer as a hard-block countdown. If the intended product behavior differs (for example, a kill timer ends an allowed break), retain the same architecture but make `effectiveBlocking` a named policy function and store the timer's `mode` (`block-until` or `break-until`). Avoid scattering this decision across UI pages.

### Timer product limits and completion behavior

Both timer types accept whole-minute durations from **1 to 480 minutes (8 hours)**. Defaults are 25 minutes for the normal focus timer and 60 minutes for the kill-switch timer. These limits keep the popup input simple, fit everyday focus sessions, and prevent accidental multi-day locks.

All timer displays use a countdown: `m:ss` below one hour and `h:mm:ss` at one hour or more. Displays round a positive fractional second up so a running timer never appears to end early.

When a timer completes, the service worker first persists the completed state and reconciles blocking rules. It then updates the toolbar badge: `ON` when manual blocking or another running timer still blocks sites, otherwise clears the badge. The first release does not request notification permission; completion is visible through the popup, blocked-page refreshes, and the badge. A later opt-in notification feature can be added without changing timer semantics.

The normal focus timer can be cancelled while running or paused. Cancellation discards its remaining duration, clears its alarm, marks it `cancelled`, and immediately recalculates effective blocking. This action never cancels a concurrently running kill timer or manual block. The kill timer has no cancellation transition.

A running kill timer survives service-worker suspension and browser restart. Its durable state contains an absolute `endAt` timestamp; on startup the worker treats it as active only when `endAt` is still in the future, recreates any missing alarm, and keeps blocking in force. If the deadline has passed, startup finalizes it as completed before answering UI requests or reconciling DNR rules.

### Anti-bypass boundary

While a kill timer is running, the extension rejects every internal attempt to make selected sites available: toggling manual blocking off, cancelling/pausing the kill timer, removing selected domains, or saving settings that would reduce its current blocking scope. The popup, options page, and blocked page hide or disable these actions, but the service worker independently validates the same policy for every message.

This is an extension-level commitment, not a device-management guarantee. Chrome users can still disable or uninstall the extension, revoke host access, use another browser/profile, or alter their device clock. The options page and kill-timer confirmation must state this plainly. The extension does not claim to be tamper-proof, collect monitoring data, or attempt to prevent Chrome-level removal.

For every effective-blocking transition, the service worker builds the desired set of dynamic Declarative Net Request rules from the normalized selected domains, then computes the add/remove delta against rules owned by this extension. Rules should cover the domain and subdomains and redirect blocked `main_frame` navigations to an extension-owned blocked page. The extension path must be declared as a narrow web-accessible resource for this redirect. Keep stable rule IDs derived from a bounded domain registry or a persisted mapping; never use arbitrary hashes without collision handling.

## Persistent storage schema

Store the schema version and all durable user state in `chrome.storage.local`. Store only small metadata and preferences, not quote-image binaries.

| Key | Shape | Purpose |
|---|---|---|
| `schemaVersion` | integer | Enables forward migrations and safe defaults |
| `settings` | object | User preferences described below |
| `timer` | object | Durable focus and kill timer state |
| `ruleState` | object | Extension-owned dynamic-rule IDs/version for reconciliation |
| `contentState` | object | Last shown quote-image ID, if anti-repeat is enabled |

`settings` fields:

| Field | Shape | Notes |
|---|---|---|
| `selectedDomains` | string array | Canonical hostnames only; lowercase, no paths/protocols, deduplicated |
| `manualBlockingEnabled` | boolean | Explicit user-controlled blocking switch |
| `focusDurationMinutes` | integer | Validated within product limits |
| `killDurationMinutes` | integer | Validated within product limits |
| `showBlockedPageStatus` | boolean | Whether the blocked page shows the compact status card |

`timer` fields:

| Field | Shape | Notes |
|---|---|---|
| `focus` | null or object | `startedAt`, `endAt`, `status`, optional `sessionId` |
| `kill` | null or object | `startedAt`, `endAt`, `status`, optional `mode` |
| `lastTransitionAt` | timestamp | Supports diagnostics and deterministic state repair |

Use epoch milliseconds for timestamps. On every state read and alarm event, expired timers are finalized by comparing `endAt` with the current time; alarms are prompts to process transitions, not the only proof that time elapsed.

`chrome.storage.sync` is optional for small user preferences only. Do not rely on it for active timers or DNR reconciliation because sync latency/conflicts can make real-time behavior surprising. If sync is added, keep `timer` and `ruleState` local and resolve settings changes through a versioned merge.

## Permissions and manifest exposure

Minimum requested permissions:

| Manifest entry | Why it is needed |
|---|---|
| `storage` | Persistent settings, timer timestamps, rule metadata, and content preferences |
| `alarms` | Reliable scheduled timer wake-ups after worker suspension |
| `declarativeNetRequestWithHostAccess` | Dynamic network-navigation redirect rules on hosts the user grants access to |

Use optional host permissions for the sites the user chooses, but request them through one explicit “website access” grant in the options UI rather than one prompt per domain. This project uses `declarativeNetRequestWithHostAccess`, rather than also declaring `declarativeNetRequest`, because redirect rules require host access and granular runtime permission keeps the install-time warning smaller. Do not request `tabs`, `activeTab`, scripting, webRequest, or broad permanent host access unless a later feature demonstrably requires them.

Manifest declarations also include:

- A `background.service_worker` with module/classic choice consistent across the project.
- `action.default_popup` for the toolbar UI.
- `options_page` (or `options_ui`) for configuration.
- A narrow `web_accessible_resources` declaration for the extension-owned blocked-page redirect target.

The initial supported baseline is **Chrome 121 or later**. This comfortably supports the MV3 service-worker model, dynamic DNR rules, optional host permissions, `chrome.alarms`, and redirects to an extension path. The product does not depend on newer DNR features; retaining this baseline avoids unnecessarily excluding users while allowing modern extension tooling.

## Chrome APIs used

| API | Role |
|---|---|
| `chrome.storage.local` | Durable state, settings, and migration data |
| `chrome.storage.onChanged` | React to state changes from any extension context |
| `chrome.alarms` | Schedule and receive focus/kill timer deadlines |
| `chrome.declarativeNetRequest` | Inspect and update extension-owned dynamic block rules |
| `chrome.runtime` messaging | Page-to-service-worker requests, lifecycle events, and optional ports |
| `chrome.runtime.onInstalled` / `onStartup` | Migrate storage and restore/reconcile alarms and rules |
| `chrome.permissions` | Request/remove optional host access as selected domains change |
| `chrome.action` | Popup configuration and optional badge/state indicator |

## Domain permissions and blocking-rule reconciliation

When a user adds a canonical selected domain, the domain is saved immediately. Blocking becomes active only after the user grants website access through Chrome's optional host-permission prompt. The extension treats broad all-sites access as satisfying every selected domain, and it also recognizes specific domain grants that cover both the apex host and subdomains. Denied or revoked access leaves the domain saved but inactive. Permission additions/removals wake the service worker and trigger reconciliation.

The blocking manager derives the desired dynamic rules from authoritative state and granted permissions. Each desired rule has a stable extension-owned ID, a DNR domain anchor, `main_frame` scope only, and redirects to `/blocked/blocked.html`. When effective blocking becomes false, all and only rules recognized as extension-owned blocked-page redirects are removed.

The reconciler compares owned installed rules with desired rules and sends only the required add/remove delta to Chrome. On a DNR quota or update error, Chrome's existing rules and the prior stored rule-ID map remain intact; the state records a user-visible `lastError` for the options page. A successful reconciliation clears that error.

## Implemented extension skeleton

The repository builds a loadable unpacked extension into `dist/`. `manifest.json` targets Chrome 121+ and wires the module service worker, popup, options page, blocked-page redirect target, local storage, alarms, DNR with runtime-granted host access, and the narrow web-accessible blocked/quote resources.

The service worker registers installation and browser-startup entry points through one lifecycle coordinator. The next milestones attach schema migration, alarm restoration, and dynamic-rule reconciliation to that coordinator in that order.

Shared message contracts define every UI-to-worker action before pages send messages. The versioned storage model defines settings, normal/kill timer state, rule metadata, and last shown quote. Rule IDs are allocated from the extension-owned range 10,000–999,999; retained domains keep their IDs and a deterministic hash with linear probing resolves collisions.

## Persistent state and timer state machine

`chrome.storage.local` holds the five versioned state areas (`schemaVersion`, `settings`, `timer`, `ruleState`, and `contentState`). Reads validate and normalize every field, remove malformed domains/invalid rule IDs, restore safe defaults for missing or corrupt values, and rewrite the repaired current schema. The initial migration accepts the prior unversioned development shape as version zero; unsupported future shapes fail safe to the current defaults.

The focus timer uses `idle`, `running`, `paused`, `completed`, and `cancelled` states. A running timer has an absolute `endAt`; pausing atomically replaces that with durable `remainingMilliseconds`, so elapsed time stops. Resuming creates a new absolute deadline. A kill timer uses only `idle`, `running`, and `completed`, is stored with an absolute deadline, and an already-running kill timer cannot be replaced with a shorter one.

Every state read passes through expiry finalization, which compares running deadlines to the current time and persists any completion. Effective blocking remains derived as `manualBlockingEnabled OR activeFocusTimer OR activeKillTimer`; it is never separately persisted.

## Edge cases and required handling

- **Service worker suspension:** Never keep authoritative timer state solely in memory. Recompute from timestamps after every wake-up.
- **Missed/delayed alarms or sleep:** On startup, alarm handling, and state reads, expire any timer whose `endAt` is in the past.
- **Browser restart/update:** Recreate missing alarms and reconcile DNR rules from storage; do not assume dynamic rules and stored state stayed aligned.
- **Concurrent popup/options edits:** Serialize mutations in the service worker, use a monotonic settings revision, and return the new revision to callers. Re-read after writes rather than trusting stale UI state.
- **Invalid domains:** Reject URLs with paths, credentials, ports (unless explicitly supported), IPs/local hosts if out of scope, public-suffix-only entries, malformed hostnames, and duplicate/subdomain ambiguities. Display actionable validation feedback.
- **Domain scope:** Decide and document whether selecting `facebook.com` also blocks `www.facebook.com`, `m.facebook.com`, and all subdomains. Recommended: yes. Do not accidentally block lookalike domains such as `notfacebook.com`.
- **Permission denied/revoked:** Keep the domain in settings with a `permissionMissing` status, explain that it cannot be blocked, and retry only after user action. Reconcile rules after permission changes.
- **DNR quotas/rule failures:** Limit supported selected domains, check rule-update errors atomically, retain the last known-good rule state, and surface a clear popup/options warning.
- **Manual toggle vs. timers:** Derive effective blocking from the policy function so ending one timer cannot disable a separate active timer or manual block.
- **Overlapping timers:** Define precedence before implementation. Recommended: both may run; blocking remains active until all states that require blocking are inactive.
- **Clock changes:** Absolute wall-clock timestamps can jump. On detection of a major clock shift, recompute conservatively, notify the user if a timer ends unexpectedly, and never extend a kill timer silently without a product policy.
- **Incognito:** Decide whether the extension is allowed in incognito and communicate that Chrome controls this separately. Avoid treating normal-profile storage as incognito session state.
- **Uninstall/reinstall and schema migration:** Missing/corrupt state must fall back safely to defaults; version migrations should be idempotent.
- **Content availability:** If the quote-image collection is empty or an asset fails, render a built-in neutral fallback without breaking the blocked page.
- **Privacy:** Do not collect browsing history, page contents, or remote analytics by default. The selected domain list and timer history are sensitive enough to keep local.

## Acceptance boundary

The first implementation is architecturally complete when the service worker can reconstruct effective blocking and both timer states from local storage after any restart; all pages can render from that same authoritative state; and dynamic rules exactly match the selected domains whenever blocking is effective.
