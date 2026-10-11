import type { FocusTimerStatus, KillTimerStatus } from "./timer.js";

export const CURRENT_SCHEMA_VERSION = 1;

export interface PersistedSettings {
  readonly selectedDomains: readonly string[];
  readonly manualBlockingEnabled: boolean;
  readonly focusDurationMinutes: number;
  readonly killDurationMinutes: number;
  readonly showBlockedPageStatus: boolean;
}

export interface FocusTimerState {
  readonly status: FocusTimerStatus;
  readonly endAt: number | null;
  readonly remainingMilliseconds: number | null;
}

export interface KillTimerState {
  readonly status: KillTimerStatus;
  readonly endAt: number | null;
}

export interface PersistedTimerState {
  readonly focus: FocusTimerState;
  readonly kill: KillTimerState;
  readonly lastTransitionAt: number | null;
}

export interface PersistedRuleState {
  readonly domainRuleIds: Readonly<Record<string, number>>;
  readonly lastError: string | null;
}

export interface PersistedContentState {
  readonly lastQuoteId: string | null;
}

export interface ExtensionStorageState {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly settings: PersistedSettings;
  readonly timer: PersistedTimerState;
  readonly ruleState: PersistedRuleState;
  readonly contentState: PersistedContentState;
}
