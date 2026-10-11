# Project Tasks — Manifest V3 Social-Media Blocker

## Product rules to preserve

- **On/off switch:** When switched on, all selected social-media sites are unavailable. When off, they are available unless a timer requires blocking.
- **Normal timer:** Selected sites are unavailable until the timer ends. The user may pause, resume, or cancel this timer. Paused time must not elapse.
- **Kill-switch timer:** Selected sites are unavailable until the timer ends. The user cannot pause, cancel, disable, or otherwise bypass it through the extension UI.
- **Blocked-site experience:** During effective blocking, any navigation to a selected site must show a randomly chosen supplied quote image.
- **Precedence:** A site is blocked when the on/off switch is on, a running normal timer is active, or a running kill-switch timer is active. A paused normal timer alone does not block. The kill-switch timer cannot be overridden by the on/off switch.

## Milestone 1 — Architecture and product decisions

- [x] Define the MV3 architecture.
- [x] Confirm the initial supported Chrome version and Declarative Net Request redirect behavior for that version. Decision: Chrome 121+; dynamic DNR `main_frame` redirects to an extension-owned, narrowly web-accessible blocked page; redirect rules use runtime-granted host access.
- [x] Define the blocked-page destination: `/blocked/blocked.html`, an extension-owned enforcement page. DNR targets selected external domains and `main_frame` only, so it cannot redirect the `chrome-extension://` destination back to itself. The page receives no original URL and is narrowly declared web-accessible.
- [x] Define and implement the supported selected-domain policy: hostname input only; selected parent domains block all subdomains; no lookalike matching. The pure shared normalizer is in `src/shared/domain.ts` and will be reused by options storage and the DNR rule builder.
- [x] Define and implement timer limits, display format, and completion behavior. Timers accept 1–480 whole minutes; defaults are 25 (normal) and 60 (kill); displays are `m:ss`/`h:mm:ss`; completion persists state, reconciles rules, and updates/clears the toolbar badge without requesting notification permission. Shared utilities are in `src/shared/timer.ts`.
- [x] Define and encode normal-timer cancellation: the normal timer may be cancelled while running or paused; cancellation clears only that timer and recalculates effective blocking. Kill timers are never cancellable. The shared permission boundary is in `src/shared/timer.ts`.
- [x] Define and encode kill-timer restart behavior: a running kill timer survives browser restart through a persisted absolute `endAt`; startup restores blocking and any missing alarm if it remains active, otherwise finalizes completion. Deadline evaluation is shared in `src/shared/timer.ts`; durable storage wiring follows in Milestone 4.
- [x] Define and encode the anti-bypass boundary. A running kill timer locks all extension-controlled paths that could make selected sites available; service-worker message validation, not just disabled UI, enforces it. Chrome-level disable/uninstall, permission revocation, other profiles/browsers, and clock changes remain possible and will be disclosed honestly. Shared control locking is in `src/shared/control-policy.ts`.

## Milestone 2 — Content asset contract

- [x] Create the user-provided content folder convention: quote images live in `src/shared/quotes/`, with the asset contract documented in that folder's `README.md`.
- [x] Document accepted image formats, naming rules, dimensions/file-size guidance, and quote-image metadata/index requirements.
- [x] Decide quote composition: each supplied image is a complete quote image; there is no separate background or quote-text pairing.
- [x] Add a content manifest/index with stable quote IDs in `src/shared/quote-content.ts`.
- [x] Define fallback content for an empty, invalid, or unavailable quote-image folder: a built-in text-only view.
- [x] Define random-selection behavior: choose on each blocked navigation and avoid immediately repeating the prior quote when alternatives exist.
- [x] Confirm that all supplied quote images remain bundled/local, with no remote fetch or third-party network permission.

## Milestone 3 — Extension skeleton and manifest

- [x] Create the loadable MV3 manifest and page entry points: module service worker, toolbar popup, options page, and blocked page. `npm run build` produces the unpacked `dist/` extension.
- [x] Declare least-privilege permissions: storage, alarms, DNR with runtime-granted host access, and optional HTTP/HTTPS host permissions for selected sites.
- [x] Add service-worker lifecycle entry points for installation and startup, with one coordinator reserved for ordered migration, alarm restoration, and rule reconciliation.
- [x] Establish typed shared message contracts and a versioned storage schema before UI work begins.
- [x] Establish a stable dynamic-rule ID allocation strategy and rule ownership boundary in `src/background/rule-ids.ts` (range 10,000–999,999, deterministic collision handling).

## Milestone 4 — Persistent state and state machine

- [x] Implement the persistent storage repository around a versioned schema in `src/background/storage-repository.ts`.
- [x] Persist the complete state shape: selected domains, manual on/off setting, timer preferences/state, dynamic-rule metadata, and last-shown quote ID.
- [x] Normalize and validate stored user domains and timer preferences before accepting them into durable state.
- [x] Implement one authoritative derived `effectiveBlocking` policy, used by the state service and future worker handlers.
- [x] Model normal timer states: `idle`, `running`, `paused`, `completed`, and `cancelled`.
- [x] Store normal-timer `remainingMilliseconds` when paused and derive a new `endAt` only when resumed.
- [x] Model kill-timer states: `idle`, `running`, and `completed`; it has no pause/cancel transition and cannot be restarted while running.
- [x] Use absolute timestamps for both running timers and durable remaining duration for a paused normal timer.
- [x] Reconcile expired state on every state read, including service-worker startup; alarm-event reconciliation joins in Milestone 6.
- [x] Add idempotent version-zero migration plus missing/corrupt-storage repair with safe defaults.

## Milestone 5 — Domain blocking engine

- [x] Request host permission for a selected domain and its subdomains over HTTP/HTTPS; denied/revoked domains remain saved but receive no rule and report missing access.
- [x] Convert canonical selected domains into DNR dynamic rules with domain anchors that cover the selected hostname and its subdomains.
- [x] Redirect blocked `main_frame` navigation to the extension-owned blocked quote page.
- [x] Ensure the redirect destination is outside selected-domain matching, so DNR cannot form a loop.
- [x] Reconcile desired and installed dynamic rules through Chrome's atomic dynamic-rule update after every caller-triggered state change.
- [x] Remove only rules recognized as owned blocked-page redirects in the extension's private ID range.
- [x] Restore/reconcile rules on installation, update, browser startup, and host-permission changes.
- [x] Handle DNR quota/update errors without replacing the last known-good rule state; persist a clearable `ruleState.lastError` for the options UI.
- [x] Explicitly test on/off behavior: manual on blocks immediately; manual off cannot bypass a running kill timer.

## Milestone 6 — Timer and alarm engine

- [x] Start a normal timer: persist timestamps, create its alarm, calculate effective blocking, and update rules.
- [x] Pause a normal timer: calculate and persist remaining duration, clear its alarm, transition to `paused`, and remove timer-caused blocking unless another condition still blocks.
- [x] Resume a normal timer: create a new end timestamp/alarm from remaining duration and re-enable timer-caused blocking.
- [x] Cancel a normal timer: clear its alarm/state and recalculate effective blocking.
- [x] Process normal-timer completion from both alarm events and timestamp checks.
- [x] Start a kill timer: persist its deadline, create an alarm, force effective blocking, and lock disallowed controls.
- [x] Process kill-timer completion from both alarm events and timestamp checks; only then unlock its controls.
- [x] Prevent all message paths—not only hidden buttons—from pausing, cancelling, or disabling a running kill timer.
- [x] Handle delayed/missed alarms, sleep, browser restart, service-worker suspension, and system clock changes.

## Milestone 7 — Blocked quote page

- [x] Build the extension-owned blocked page that is reached whenever a selected site is visited while effective blocking is true.
- [x] Load the user-supplied local asset index and choose a random valid quote image.
- [x] Render a readable quote over the image with accessible contrast and responsive layout.
- [x] Show the active reason and, where appropriate, timer status: manual block, normal timer, or kill timer.
- [x] For a normal timer, expose only permitted actions (for example, return to a safe page; timer controls remain in the popup).
- [x] For a kill timer, show remaining time but no bypass, pause, cancellation, or disable control.
- [x] Ensure reloads and new visits produce a random selection without flash-of-empty-content or asset errors.
- [x] Confirm browser back/forward behavior does not leak users through the selected domain while blocking remains active.

## Milestone 8 — Popup UI

- [x] Create a compact status view showing effective blocking status, active reason(s), and countdowns.
- [x] Add the manual on/off switch with a clear explanation when it cannot make sites available because a timer is still active.
- [x] Add normal-timer controls: start, pause, resume, and cancel.
- [x] Add kill-switch-timer controls: start and remaining-time display; hide/disable all stop controls while it runs.
- [x] Add validation and confirmation for starting a kill timer, since it cannot be ended in the extension before expiry.
- [x] Add a link to options for domain/content configuration.
- [x] Make the popup rehydrate from persistent authoritative state every time it opens.
- [x] Keep countdown display accurate while open, but never make it the timer source of truth.

## Milestone 9 — Options page

- [x] Build selected-domain management: add, remove, list, validation errors, and permission status.
- [x] Provide starter domain suggestions without pre-granting any host permissions.
- [x] Add default durations and blocked-page display preferences.
- [x] Keep quote assets bundled locally with no user-facing configuration for now.
- [x] Surface DNR quota errors, missing host permissions, and any rule reconciliation failure.
- [x] Explain the kill-switch limitation: it cannot be disabled inside the extension, but Chrome-level extension removal/disable remains outside its control.
- [x] Ensure saving options updates stored settings and triggers worker-side rule reconciliation.

## Milestone 11 — Reliability, accessibility, and privacy

- [ ] Test service-worker termination/restart during each timer state.
- [ ] Test browser restart, machine sleep/wake, delayed alarms, and extension updates.
- [x] Test overlapping states: switch on plus normal timer; paused normal timer plus switch; normal timer plus kill timer; and a timer ending while another block condition remains.
- [ ] Test denied/revoked site permissions and changes to the selected-domain list while blocking is active.
- [x] Test malformed domains, duplicate domains, subdomains, redirects, and blocked-page redirect loops.
- [ ] Test dynamic rule quota/error recovery and rule reconciliation after storage changes.
- [ ] Test keyboard navigation, focus management, contrast, reduced motion, image/quote fallback, and screen-reader labels across all pages.
- [x] Verify that no browsing history, page content, or analytics data is collected by default.
- [x] Document known limitations, including Chrome-level disabling/uninstalling and non-main-frame request scope if applicable.

## Milestone 12 — Release readiness

- [x] Prepare a user setup guide for adding domains and supplying quote images.
- [x] Prepare concise permission justifications for the Chrome Web Store listing.
- [x] Create privacy-policy text consistent with fully local storage/content.
- [ ] Create screenshots demonstrating the popup, options, and blocked quote page.
- [ ] Test the packaged extension in a clean Chrome profile.
- [x] Run a final regression checklist covering the three core rules: manual switch, pausable normal timer, and non-cancellable kill timer.

## Dependency order

```text
Architecture + asset contract
        ↓
Manifest + storage/state machine
        ↓
Blocking engine + alarms
        ↓
Blocked page
        ↓
Popup / options
        ↓
Reliability testing + release preparation
```

The blocking engine and timer state machine should be completed before detailed UI work. That keeps all pages as clients of one consistent policy, especially for the non-cancellable kill-switch timer.
