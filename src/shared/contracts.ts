import type { EffectiveBlockingState } from "./blocking-policy.js";
import type { ExtensionStorageState } from "./schema.js";

export type ExtensionMessage =
  | { readonly type: "GET_DASHBOARD_STATE" }
  | { readonly type: "SET_MANUAL_BLOCKING"; readonly enabled: boolean }
  | { readonly type: "START_FOCUS_TIMER"; readonly durationMinutes: number }
  | { readonly type: "PAUSE_FOCUS_TIMER" }
  | { readonly type: "RESUME_FOCUS_TIMER" }
  | { readonly type: "CANCEL_FOCUS_TIMER" }
  | { readonly type: "START_KILL_TIMER"; readonly durationMinutes: number }
  | { readonly type: "SAVE_SETTINGS"; readonly settings: SettingsInput };

export interface SettingsInput {
  readonly selectedDomains: readonly string[];
  readonly focusDurationMinutes: number;
  readonly killDurationMinutes: number;
  readonly showBlockedPageStatus: boolean;
}

export interface DashboardState {
  readonly storageState: ExtensionStorageState;
  readonly effectiveBlocking: EffectiveBlockingState;
}

export type ExtensionResponse<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ExtensionError };

export type ExtensionError =
  | "invalid-message"
  | "invalid-settings"
  | "kill-timer-locked"
  | "permission-missing"
  | "storage-failure"
  | "rule-update-failure";
