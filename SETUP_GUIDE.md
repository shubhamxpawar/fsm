# Setup Guide

1. Install dependencies with `npm install`.
2. Build the unpacked extension with `npm run build`.
3. Open Chrome and go to `chrome://extensions`.
4. Enable Developer mode.
5. Choose Load unpacked and select the repo root. The build publishes the runtime folders (`background/`, `popup/`, `options/`, `blocked/`, `shared/`, and `quotes/`) into the root so the checked-in `manifest.json` can load directly.
6. Open the extension options page.
7. Add the domains you want to block.
8. Grant host access for each domain you want the extension to actively block.
9. Place quote images in `src/shared/quotes/`, add them to `src/shared/quote-content.ts`, and rebuild whenever the asset set changes.

Product rules:

- Manual switch on: selected sites are unavailable immediately.
- Normal timer: selected sites are unavailable until the timer ends, and the timer may be paused, resumed, or cancelled.
- Kill timer: selected sites are unavailable until the timer ends, and the extension UI cannot stop it early.
