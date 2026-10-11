import { getEffectiveBlockingState } from "../shared/blocking-policy.js";
import { formatRemainingDuration, getRemainingMilliseconds } from "../shared/timer.js";
import type { DashboardState, ExtensionError, ExtensionResponse } from "../shared/contracts.js";
import type { ExtensionStorageState } from "../shared/schema.js";
import { sendExtensionMessage } from "../shared/extension-client.js";

const statusSummary = document.getElementById("status-summary") as HTMLParagraphElement;
const reasonChips = document.getElementById("reason-chips") as HTMLDivElement;
const manualToggle = document.getElementById("manual-toggle") as HTMLButtonElement;
const manualNote = document.getElementById("manual-note") as HTMLSpanElement;
const focusMinutes = document.getElementById("focus-minutes") as HTMLInputElement;
const focusStatus = document.getElementById("focus-status") as HTMLDivElement;
const focusStart = document.getElementById("focus-start") as HTMLButtonElement;
const focusPause = document.getElementById("focus-pause") as HTMLButtonElement;
const focusResume = document.getElementById("focus-resume") as HTMLButtonElement;
const focusCancel = document.getElementById("focus-cancel") as HTMLButtonElement;
const killMinutes = document.getElementById("kill-minutes") as HTMLInputElement;
const killStatus = document.getElementById("kill-status") as HTMLDivElement;
const killStart = document.getElementById("kill-start") as HTMLButtonElement;
const openOptions = document.getElementById("open-options") as HTMLButtonElement;
const errorLine = document.getElementById("error-line") as HTMLParagraphElement;

let dashboardState: DashboardState | null = null;
let renderTimerId: number | null = null;
let isBusy = false;
let pendingManualBlockingEnabled: boolean | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  wireEvents();
  await refreshDashboard();
}

function wireEvents(): void {
  manualToggle.addEventListener("click", () => {
    if (dashboardState === null) {
      return;
    }

    const currentValue =
      pendingManualBlockingEnabled ??
      dashboardState.storageState.settings.manualBlockingEnabled;
    const nextValue = !currentValue;

    void runMutation(async () => {
      pendingManualBlockingEnabled = nextValue;
      const response = await sendExtensionMessage<ExtensionStorageState>({
        type: "SET_MANUAL_BLOCKING",
        enabled: nextValue,
      });
      return handleMutationResponse(response);
    });
  });

  focusStart.addEventListener("click", () => {
    void runMutation(async () => {
      const durationMinutes = readDurationInput(focusMinutes, 25);
      const response = await sendExtensionMessage<ExtensionStorageState>({
        type: "START_FOCUS_TIMER",
        durationMinutes,
      });
      return handleMutationResponse(response);
    });
  });

  focusPause.addEventListener("click", () => {
    void runMutation(async () => {
      const response = await sendExtensionMessage<ExtensionStorageState>({ type: "PAUSE_FOCUS_TIMER" });
      return handleMutationResponse(response);
    });
  });

  focusResume.addEventListener("click", () => {
    void runMutation(async () => {
      const response = await sendExtensionMessage<ExtensionStorageState>({ type: "RESUME_FOCUS_TIMER" });
      return handleMutationResponse(response);
    });
  });

  focusCancel.addEventListener("click", () => {
    void runMutation(async () => {
      const response = await sendExtensionMessage<ExtensionStorageState>({ type: "CANCEL_FOCUS_TIMER" });
      return handleMutationResponse(response);
    });
  });

  killStart.addEventListener("click", () => {
    const durationMinutes = readDurationInput(killMinutes, 60);
    const confirmed = window.confirm(
      `Start a ${durationMinutes}-minute kill timer? It cannot be stopped in the extension before it ends.`,
    );
    if (!confirmed) {
      return;
    }

    void runMutation(async () => {
      const response = await sendExtensionMessage<ExtensionStorageState>({
        type: "START_KILL_TIMER",
        durationMinutes,
      });
      return handleMutationResponse(response);
    });
  });

  openOptions.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
}

async function refreshDashboard(): Promise<void> {
  clearError();
  const response = await sendExtensionMessage<DashboardState>({ type: "GET_DASHBOARD_STATE" });
  if (!response.ok) {
    setError(describeError(response.error));
    return;
  }

  dashboardState = response.data;
  syncInputDefaults(response.data.storageState);
  render();
  startRenderTicker();
}

function syncInputDefaults(state: ExtensionStorageState): void {
  focusMinutes.value = state.settings.focusDurationMinutes.toString();
  killMinutes.value = state.settings.killDurationMinutes.toString();
}

function render(): void {
  if (dashboardState === null) {
    return;
  }

  const state = dashboardState.storageState;
  const now = Date.now();
  const focusRunning = state.timer.focus.status === "running" && state.timer.focus.endAt !== null;
  const focusPaused = state.timer.focus.status === "paused";
  const killRunning = state.timer.kill.status === "running" && state.timer.kill.endAt !== null;
  const killRemaining = killRunning
    ? formatRemainingDuration(getRemainingMilliseconds(state.timer.kill.endAt, now))
    : null;
  const focusRemaining = focusRunning
    ? formatRemainingDuration(getRemainingMilliseconds(state.timer.focus.endAt, now))
    : focusPaused && state.timer.focus.remainingMilliseconds !== null
      ? formatRemainingDuration(state.timer.focus.remainingMilliseconds)
      : null;
  const killLocksSwitch = state.timer.kill.status === "running";
  const manualEnabled =
    pendingManualBlockingEnabled ??
    state.settings.manualBlockingEnabled;

  statusSummary.textContent = describeSummary(dashboardState, focusRemaining, killRemaining);
  manualToggle.classList.toggle("is-on", manualEnabled);
  manualToggle.setAttribute("aria-pressed", String(manualEnabled));
  manualToggle.disabled = isBusy || killLocksSwitch;
  manualNote.textContent = killLocksSwitch
    ? "Locked while the kill timer is active."
    : "When on, the selected domains are unavailable.";

  focusStatus.textContent = describeFocusStatus(state, focusRemaining);
  focusStart.disabled = isBusy;
  focusPause.disabled = isBusy || !focusRunning;
  focusResume.disabled = isBusy || !focusPaused;
  focusCancel.disabled = isBusy || !(focusRunning || focusPaused);

  killStatus.textContent = killRunning
    ? `Running. ${killRemaining === null ? "" : `${killRemaining} remaining.`}`
    : state.timer.kill.status === "completed"
      ? "Completed."
      : "Ready to start.";
  killStart.disabled = isBusy || state.timer.kill.status === "running";

  reasonChips.replaceChildren(
    createChip("Manual switch", dashboardState.effectiveBlocking.manualBlocking),
    createChip("Normal timer", dashboardState.effectiveBlocking.focusTimerBlocking),
    createChip("Kill timer", dashboardState.effectiveBlocking.killTimerBlocking),
  );
}

function createChip(label: string, active: boolean): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = active ? "chip active" : "chip";
  chip.textContent = label;
  return chip;
}

function describeSummary(
  dashboard: DashboardState,
  focusRemaining: string | null,
  killRemaining: string | null,
): string {
  const blocking = dashboard.effectiveBlocking;
  if (blocking.killTimerBlocking) {
    return killRemaining === null
      ? "A kill timer is active."
      : `A kill timer is active. ${killRemaining} remaining.`;
  }

  if (blocking.focusTimerBlocking) {
    return focusRemaining === null
      ? "A normal timer is active."
      : `A normal timer is active. ${focusRemaining} remaining.`;
  }

  if (blocking.manualBlocking) {
    return "Manual blocking is on.";
  }

  return "Selected sites are currently available.";
}

function describeFocusStatus(state: ExtensionStorageState, focusRemaining: string | null): string {
  if (state.timer.focus.status === "running") {
    return focusRemaining === null ? "Running." : `Running. ${focusRemaining} remaining.`;
  }

  if (state.timer.focus.status === "paused") {
    return focusRemaining === null ? "Paused." : `Paused with ${focusRemaining} left.`;
  }

  if (state.timer.focus.status === "completed") {
    return "Completed.";
  }

  if (state.timer.focus.status === "cancelled") {
    return "Cancelled.";
  }

  return "Ready to start.";
}

async function runMutation(task: () => Promise<DashboardState | null>): Promise<void> {
  if (isBusy) {
    return;
  }

  isBusy = true;
  render();

  try {
    const nextState = await task();
    if (nextState !== null) {
      dashboardState = nextState;
      pendingManualBlockingEnabled = null;
      clearError();
    }
  } catch (error) {
    pendingManualBlockingEnabled = null;
    setError(error instanceof Error ? error.message : "Unable to update the popup state.");
  } finally {
    isBusy = false;
    render();
  }
}

async function handleMutationResponse(
  response: ExtensionResponse<ExtensionStorageState>,
): Promise<DashboardState | null> {
  if (!response.ok) {
    pendingManualBlockingEnabled = null;
    setError(describeError(response.error));
    return null;
  }

  return {
    storageState: response.data,
    effectiveBlocking: deriveEffectiveBlocking(response.data),
  };
}

function deriveEffectiveBlocking(state: ExtensionStorageState): DashboardState["effectiveBlocking"] {
  return getEffectiveBlockingState(state, Date.now());
}

function startRenderTicker(): void {
  if (renderTimerId !== null) {
    window.clearInterval(renderTimerId);
  }

  renderTimerId = window.setInterval(() => {
    if (dashboardState === null) {
      return;
    }

    dashboardState = {
      storageState: dashboardState.storageState,
      effectiveBlocking: deriveEffectiveBlocking(dashboardState.storageState),
    };
    render();
  }, 1_000);
}

function readDurationInput(input: HTMLInputElement, fallback: number): number {
  const raw = Number.parseInt(input.value, 10);
  const bounded = Number.isInteger(raw) ? raw : fallback;
  return Math.min(480, Math.max(1, bounded));
}

function describeError(error: ExtensionError): string {
  switch (error) {
    case "kill-timer-locked":
      return "The kill timer is active, so this control is locked.";
    case "invalid-settings":
      return "The timer duration is invalid.";
    case "rule-update-failure":
      return "Chrome rejected the rule update.";
    case "storage-failure":
      return "The extension could not save the updated state.";
    case "invalid-message":
      return "The popup sent an invalid message.";
    case "permission-missing":
      return "A required site permission is missing.";
    default:
      return "The extension rejected the request.";
  }
}

function setError(message: string): void {
  errorLine.textContent = message;
}

function clearError(): void {
  errorLine.textContent = "";
}
