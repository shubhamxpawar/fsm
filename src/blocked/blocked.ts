import { getEffectiveBlockingState } from "../shared/blocking-policy.js";
import { createDefaultStorageState } from "../shared/defaults.js";
import type { DashboardState, ExtensionResponse } from "../shared/contracts.js";
import type { ExtensionStorageState } from "../shared/schema.js";
import { formatRemainingDuration, getRemainingMilliseconds } from "../shared/timer.js";
import { renderRandomQuote } from "../shared/quote-page.js";

const quoteImage = document.getElementById("quote-image") as HTMLDivElement;
const quoteFallback = document.getElementById("quote-fallback") as HTMLDivElement;
const statusPanel = document.getElementById("status-panel") as HTMLDivElement;
const reasonLine = document.getElementById("reason-line") as HTMLParagraphElement;
const timerLine = document.getElementById("timer-line") as HTMLParagraphElement;
const reasonChips = document.getElementById("reason-chips") as HTMLDivElement;
const leavePage = document.getElementById("leave-page") as HTMLButtonElement;
const reloadPage = document.getElementById("reload-page") as HTMLButtonElement;
let currentState: ExtensionStorageState | null = null;
let countdownTimerId: number | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  wireActions();
  await renderDashboard();
}

function wireActions(): void {
  leavePage.addEventListener("click", () => {
    window.location.replace("about:blank");
  });

  reloadPage.addEventListener("click", () => {
    void renderDashboard();
  });
}

async function renderDashboard(): Promise<void> {
  const dashboard = await loadDashboardState();
  currentState = dashboard.storageState;

  await renderRandomQuote(
    { image: quoteImage, fallback: quoteFallback },
    {
      previousQuoteId: dashboard.storageState.contentState.lastQuoteId,
      fallbackMessage: "The local quote images could not be loaded.",
      onQuoteSelected: async (quote) => {
        await chrome.storage.local.set({
          contentState: { ...dashboard.storageState.contentState, lastQuoteId: quote.id },
        });
      },
    },
  );

  renderStatus(dashboard.storageState, dashboard.effectiveBlocking, Date.now());
  startStatusTicker();
}

async function loadDashboardState(): Promise<DashboardState> {
  try {
    const response = await sendDashboardMessage();
    if (response.ok) {
      return response.data;
    }
  } catch {
    // Fall through to storage-backed recovery.
  }

  const storageState = await loadStorageStateFallback();
  return {
    storageState,
    effectiveBlocking: getEffectiveBlockingState(storageState, Date.now()),
  };
}

async function sendDashboardMessage(): Promise<ExtensionResponse<DashboardState>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_DASHBOARD_STATE" }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response as ExtensionResponse<DashboardState>);
    });
  });
}

async function loadStorageStateFallback(): Promise<ExtensionStorageState> {
  const stored = await chrome.storage.local.get([
    "schemaVersion",
    "settings",
    "timer",
    "ruleState",
    "contentState",
  ]);
  const defaults = createDefaultStorageState();

  return {
    schemaVersion: defaults.schemaVersion,
    settings: {
      ...defaults.settings,
      ...(isRecord(stored.settings) ? normalizeSettings(stored.settings, defaults.settings) : {}),
    },
    timer: defaults.timer,
    ruleState: defaults.ruleState,
    contentState: {
      lastQuoteId:
        isRecord(stored.contentState) && typeof stored.contentState.lastQuoteId === "string"
          ? stored.contentState.lastQuoteId
          : defaults.contentState.lastQuoteId,
    },
  };
}

function normalizeSettings(
  value: Record<string, unknown>,
  defaults: ExtensionStorageState["settings"],
): ExtensionStorageState["settings"] {
  return {
    selectedDomains: Array.isArray(value.selectedDomains)
      ? value.selectedDomains.filter((domain): domain is string => typeof domain === "string")
      : defaults.selectedDomains,
    manualBlockingEnabled:
      typeof value.manualBlockingEnabled === "boolean"
        ? value.manualBlockingEnabled
        : defaults.manualBlockingEnabled,
    focusDurationMinutes:
      typeof value.focusDurationMinutes === "number"
        ? value.focusDurationMinutes
        : defaults.focusDurationMinutes,
    killDurationMinutes:
      typeof value.killDurationMinutes === "number"
        ? value.killDurationMinutes
        : defaults.killDurationMinutes,
    showBlockedPageStatus:
      typeof value.showBlockedPageStatus === "boolean"
        ? value.showBlockedPageStatus
        : defaults.showBlockedPageStatus,
  };
}

function renderStatus(
  state: ExtensionStorageState,
  effectiveBlocking: DashboardState["effectiveBlocking"],
  now: number,
): void {
  statusPanel.hidden = !state.settings.showBlockedPageStatus;
  if (!state.settings.showBlockedPageStatus) {
    return;
  }

  const focusRemaining =
    state.timer.focus.status === "running" && state.timer.focus.endAt !== null
      ? formatRemainingDuration(getRemainingMilliseconds(state.timer.focus.endAt, now))
      : null;
  const killRemaining =
    state.timer.kill.status === "running" && state.timer.kill.endAt !== null
      ? formatRemainingDuration(getRemainingMilliseconds(state.timer.kill.endAt, now))
      : null;

  if (effectiveBlocking.killTimerBlocking) {
    reasonLine.textContent = "Kill timer is active.";
    timerLine.textContent = killRemaining === null ? "Blocking stays on until it ends." : `${killRemaining} remaining.`;
  } else if (effectiveBlocking.focusTimerBlocking) {
    reasonLine.textContent = "Normal timer is active.";
    timerLine.textContent = focusRemaining === null ? "Blocking stays on until it ends." : `${focusRemaining} remaining.`;
  } else if (effectiveBlocking.manualBlocking) {
    reasonLine.textContent = "Manual switch is on.";
    timerLine.textContent = "Selected sites stay blocked until you turn it off.";
  } else {
    reasonLine.textContent = "Blocking state is refreshing.";
    timerLine.textContent = "";
  }

  reasonChips.replaceChildren(
    createChip("Manual", effectiveBlocking.manualBlocking),
    createChip("Normal", effectiveBlocking.focusTimerBlocking),
    createChip("Kill", effectiveBlocking.killTimerBlocking),
  );
}

function startStatusTicker(): void {
  if (countdownTimerId !== null) {
    window.clearInterval(countdownTimerId);
  }

  countdownTimerId = window.setInterval(() => {
    if (currentState === null) {
      return;
    }

    const now = Date.now();
    const effectiveBlocking = getEffectiveBlockingState(currentState, now);
    renderStatus(currentState, effectiveBlocking, now);

    const focusEnded =
      currentState.timer.focus.status === "running" &&
      currentState.timer.focus.endAt !== null &&
      currentState.timer.focus.endAt <= now;
    const killEnded =
      currentState.timer.kill.status === "running" &&
      currentState.timer.kill.endAt !== null &&
      currentState.timer.kill.endAt <= now;

    if (focusEnded || killEnded) {
      void renderDashboard();
    }
  }, 1000);
}

function createChip(label: string, active: boolean): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = active ? "chip is-active" : "chip";
  chip.textContent = label;
  return chip;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
