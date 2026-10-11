# Fxck Social Media (FSM)

**Fxck Social Media (FSM)** is a distraction-free Chrome Extension (Manifest V3) built with TypeScript. It empowers you to take control of your attention by blocking social media sites using flexible focus timers, strict kill-switches, and local offline quote cards.

---

## ✨ Features

- **Domain-Level Blocking:** Block targeted domain families (e.g., `x.com` / `twitter.com`, `instagram.com`, `facebook.com`) and all associated subdomains.
- **Focus Timer:** Flexible work session timer supporting pause, resume, and cancellation.
- **Kill-Switch Timer:** Non-bypassable hard lock timer that strictly prevents disabling blocking or modifying domain lists until the session ends.
- **Manifest V3 Declarative Net Request (DNR):** Uses native Chrome DNR rules for lightweight and instantaneous redirection without constant background script execution.
- **Motivational Block Page:** Redirects blocked navigations to a local extension page displaying random inspirational quote images offline.
- **Privacy-First Architecture:** All settings, domain configurations, and session states are stored exclusively in `chrome.storage.local`. No analytics or tracking.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- Google Chrome or Chromium-based browser (v121 or higher)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/fsm.git
   cd fsm
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```

4. **Load into Chrome:**
   - Open Chrome and navigate to `chrome://extensions`.
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked**.
   - Select the root repository folder (`fsm/`).

---

## 🛠 Usage Guide

1. Click the extension icon in your Chrome toolbar to open the popup or go to the Options page.
2. Add the hostnames you wish to block (e.g. `instagram.com`).
3. Grant host permissions when prompted so Chrome allows DNR blocking for those domains.
4. Toggle manual blocking or start a Focus / Kill session.

---

## 📜 Available Scripts

- `npm run build`: Compiles TypeScript sources (`src/`) and prepares root runtime assets for Chrome.
- `npm run test`: Executes the unit test suite verifying domain normalization and state machine behavior.
- `npm run typecheck`: Runs TypeScript compiler without emitting files to verify type safety.

---

## 🏗 Architecture & Design

The extension is structured around a centralized Manifest V3 service worker that serves as the single source of truth for timer states, dynamic DNR rules, and alarms.

```
fsm/
├── manifest.json       # Chrome Extension Manifest V3
├── src/                # TypeScript Source Code
│   ├── background/     # Service worker, state management, DNR reconciliation
│   ├── popup/          # Popup UI controls
│   ├── options/        # Domain management and options page
│   ├── blocked/        # Blocked redirection page
│   └── shared/         # Common types, contracts, schema, and quote assets
├── scripts/            # Build and compilation scripts
└── tests/              # Unit tests
```

---

## 📄 License

ISC License. See package configuration for details.
