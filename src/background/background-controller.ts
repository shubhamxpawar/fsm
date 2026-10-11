import { getEffectiveBlockingState } from "../shared/blocking-policy.js";
import { canChangeManualBlocking } from "../shared/control-policy.js";
import { normalizeDomain } from "../shared/domain.js";
import { isValidTimerDurationMinutes } from "../shared/timer.js";
import type {
  DashboardState,
  ExtensionMessage,
  ExtensionResponse,
  SettingsInput,
} from "../shared/contracts.js";
import type { ExtensionStorageState } from "../shared/schema.js";
import {
  cancelFocusTimer,
  finalizeExpiredTimers,
  getStableTimerNow,
  pauseFocusTimer,
  resumeFocusTimer,
  startFocusTimer,
  startKillTimer,
} from "./timer-state-machine.js";
import { BlockingManager } from "./blocking-manager.js";
import { StateService } from "./state-service.js";

const FOCUS_ALARM_NAME = "focus-timer";
const KILL_ALARM_NAME = "kill-timer";

export class BackgroundController {
  private readonly stateService = new StateService();
  private readonly blockingManager = new BlockingManager();
  private pending: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.enqueue(async () => {
      const state = await this.stateService.getCurrentState();
      await this.reconcilePersistAndSync(state, Date.now());
    });
  }

  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== FOCUS_ALARM_NAME && alarm.name !== KILL_ALARM_NAME) {
      return;
    }

    await this.enqueue(async () => {
      const state = await this.stateService.getCurrentState();
      await this.reconcilePersistAndSync(state, Date.now());
    });
  }

  async handleMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ): Promise<ExtensionResponse<DashboardState | ExtensionStorageState>> {
    try {
      if (sender.id !== chrome.runtime.id || !isExtensionMessage(message)) {
        return { ok: false, error: "invalid-message" };
      }

      switch (message.type) {
        case "GET_DASHBOARD_STATE":
          return { ok: true, data: await this.getDashboardState() };
        case "SET_MANUAL_BLOCKING":
          return this.wrapResult(this.setManualBlocking(message.enabled));
        case "START_FOCUS_TIMER":
          return this.wrapResult(this.startFocusTimer(message.durationMinutes));
        case "PAUSE_FOCUS_TIMER":
          return this.wrapResult(this.pauseFocusTimer());
        case "RESUME_FOCUS_TIMER":
          return this.wrapResult(this.resumeFocusTimer());
        case "CANCEL_FOCUS_TIMER":
          return this.wrapResult(this.cancelFocusTimer());
        case "START_KILL_TIMER":
          return this.wrapResult(this.startKillTimer(message.durationMinutes));
        case "SAVE_SETTINGS":
          return this.wrapResult(this.saveSettings(message.settings));
        default:
          return { ok: false, error: "invalid-message" };
      }
    } catch {
      return { ok: false, error: "storage-failure" };
    }
  }

  private async getDashboardState(): Promise<DashboardState> {
    const state = await this.stateService.getCurrentState();
    const now = getStableTimerNow(state, Date.now());
    return {
      storageState: state,
      effectiveBlocking: getEffectiveBlockingState(state, now),
    };
  }

  private async setManualBlocking(enabled: boolean): Promise<ExtensionStorageState> {
    return this.mutateState(async (state) => {
      if (state.settings.manualBlockingEnabled === enabled) {
        return state;
      }

      if (!canChangeManualBlocking(state.timer.kill.status)) {
        throw new Error("kill-timer-locked");
      }

      return {
        ...state,
        settings: {
          ...state.settings,
          manualBlockingEnabled: enabled,
        },
      };
    });
  }

  private async startFocusTimer(durationMinutes: number): Promise<ExtensionStorageState> {
    return this.mutateState(async (state, now) => startFocusTimer(state, durationMinutes, now));
  }

  private async pauseFocusTimer(): Promise<ExtensionStorageState> {
    return this.mutateState(async (state, now) => pauseFocusTimer(state, now));
  }

  private async resumeFocusTimer(): Promise<ExtensionStorageState> {
    return this.mutateState(async (state, now) => resumeFocusTimer(state, now));
  }

  private async cancelFocusTimer(): Promise<ExtensionStorageState> {
    return this.mutateState(async (state, now) => cancelFocusTimer(state, now));
  }

  private async startKillTimer(durationMinutes: number): Promise<ExtensionStorageState> {
    return this.mutateState(async (state, now) => startKillTimer(state, durationMinutes, now));
  }

  private async saveSettings(settings: SettingsInput): Promise<ExtensionStorageState> {
    return this.mutateState(async (state) => {
      const selectedDomains = normalizeSelectedDomains(settings.selectedDomains);
      const currentDomains = state.settings.selectedDomains;
      const killRunning = state.timer.kill.status === "running";
      const shrinksBlockingScope = currentDomains.some(
        (domain) => !selectedDomains.includes(domain),
      );

      if (killRunning && shrinksBlockingScope) {
        throw new Error("kill-timer-locked");
      }

      if (!isValidTimerDurationMinutes(settings.focusDurationMinutes)) {
        throw new Error("invalid-settings");
      }
      if (!isValidTimerDurationMinutes(settings.killDurationMinutes)) {
        throw new Error("invalid-settings");
      }

      return {
        ...state,
        settings: {
          ...state.settings,
          selectedDomains,
          focusDurationMinutes: settings.focusDurationMinutes,
          killDurationMinutes: settings.killDurationMinutes,
          showBlockedPageStatus: settings.showBlockedPageStatus,
        },
      };
    });
  }

  private async mutateState(
    mutate: (state: ExtensionStorageState, now: number) => ExtensionStorageState | Promise<ExtensionStorageState>,
  ): Promise<ExtensionStorageState> {
    return this.enqueue(async () => {
      const state = await this.stateService.getCurrentState();
      const now = getStableTimerNow(state, Date.now());
      const nextState = await mutate(state, now);
      return this.reconcilePersistAndSync(nextState, now);
    });
  }

  private async reconcilePersistAndSync(
    state: ExtensionStorageState,
    now: number,
  ): Promise<ExtensionStorageState> {
    const finalized = finalizeExpiredTimers(state, now);
    const blockingState = finalized.changed ? finalized.state : state;
    const reconciliation = await this.blockingManager.reconcile(blockingState, now);
    const nextState = reconciliation.state;

    await this.stateService.save(nextState);
    await this.syncAlarms(nextState);
    await this.updateBadge(nextState, now);

    return nextState;
  }

  private async syncAlarms(state: ExtensionStorageState): Promise<void> {
    await Promise.all([
      syncAlarm(FOCUS_ALARM_NAME, state.timer.focus.status === "running" ? state.timer.focus.endAt : null),
      syncAlarm(KILL_ALARM_NAME, state.timer.kill.status === "running" ? state.timer.kill.endAt : null),
    ]);
  }

  private async updateBadge(state: ExtensionStorageState, now: number): Promise<void> {
    const blocking = getEffectiveBlockingState(state, now);
    await chrome.action.setBadgeText({ text: blocking.isBlocked ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.pending.then(task, task);
    this.pending = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async wrapResult<T>(
    task: Promise<T>,
  ): Promise<ExtensionResponse<T>> {
    try {
      return { ok: true, data: await task };
    } catch (error) {
      if (error instanceof Error && error.message === "kill-timer-locked") {
        return { ok: false, error: "kill-timer-locked" };
      }
      if (error instanceof Error && error.message === "invalid-settings") {
        return { ok: false, error: "invalid-settings" };
      }
      if (error instanceof Error && error.message === "permission-missing") {
        return { ok: false, error: "permission-missing" };
      }

      return { ok: false, error: "storage-failure" };
    }
  }
}

export const backgroundController = new BackgroundController();

function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string") {
    return false;
  }

  switch (record.type) {
    case "GET_DASHBOARD_STATE":
    case "PAUSE_FOCUS_TIMER":
    case "RESUME_FOCUS_TIMER":
    case "CANCEL_FOCUS_TIMER":
      return true;
    case "SET_MANUAL_BLOCKING":
      return typeof record.enabled === "boolean";
    case "START_FOCUS_TIMER":
    case "START_KILL_TIMER":
      return typeof record.durationMinutes === "number";
    case "SAVE_SETTINGS":
      return isSettingsInput(record.settings);
    default:
      return false;
  }
}

function isSettingsInput(value: unknown): value is SettingsInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.selectedDomains) &&
    typeof record.focusDurationMinutes === "number" &&
    typeof record.killDurationMinutes === "number" &&
    typeof record.showBlockedPageStatus === "boolean"
  );
}

function normalizeSelectedDomains(domains: readonly string[]): readonly string[] {
  return [...new Set(
    domains.flatMap((domain) => {
      if (typeof domain !== "string") {
        return [];
      }

      const normalized = normalizeDomain(domain.trim());
      return normalized.ok ? [normalized.domain] : [];
    }),
  )].sort((first, second) => first.localeCompare(second));
}

async function syncAlarm(name: string, when: number | null): Promise<void> {
  if (when === null) {
    await chrome.alarms.clear(name);
    return;
  }

  await chrome.alarms.create(name, { when });
}
