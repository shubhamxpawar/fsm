import { createDefaultStorageState } from "../shared/defaults.js";
import { normalizeDomain } from "../shared/domain.js";
import {
  CURRENT_SCHEMA_VERSION,
  type ExtensionStorageState,
  type FocusTimerState,
  type KillTimerState,
  type PersistedRuleState,
  type PersistedSettings,
  type PersistedTimerState,
} from "../shared/schema.js";
import { isValidTimerDurationMinutes } from "../shared/timer.js";

const STORAGE_KEYS = ["schemaVersion", "settings", "timer", "ruleState", "contentState"] as const;

export class StorageRepository {
  async load(): Promise<ExtensionStorageState> {
    const stored = await chrome.storage.local.get([...STORAGE_KEYS]);
    const { state, needsRepair } = parseStorageState(stored);

    if (needsRepair) {
      await this.save(state);
    }

    return state;
  }

  async save(state: ExtensionStorageState): Promise<void> {
    await chrome.storage.local.set({
      schemaVersion: state.schemaVersion,
      settings: state.settings,
      timer: state.timer,
      ruleState: state.ruleState,
      contentState: state.contentState,
    });
  }
}

function parseStorageState(value: Record<string, unknown>): {
  readonly state: ExtensionStorageState;
  readonly needsRepair: boolean;
} {
  const migrated = migrateStorage(value);
  const defaults = createDefaultStorageState();
  const settings = parseSettings(migrated.settings, defaults.settings);
  const timer = parseTimer(migrated.timer, defaults.timer);
  const ruleState = parseRuleState(migrated.ruleState);
  const lastQuoteId = isNullableString(migrated.contentState, "lastQuoteId")
    ? migrated.contentState.lastQuoteId
    : null;
  const state: ExtensionStorageState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings,
    timer,
    ruleState,
    contentState: { lastQuoteId },
  };

  return {
    state,
    needsRepair: JSON.stringify(value) !== JSON.stringify(state),
  };
}

/**
 * Version zero is the pre-versioned shape created by early development builds.
 * Its field names already match version one, so adding the schema version is a
 * safe, idempotent migration. Unknown future versions are read defensively and
 * rewritten only into the current supported shape.
 */
function migrateStorage(value: Record<string, unknown>): Record<string, unknown> {
  const sourceVersion = isPositiveInteger(value.schemaVersion) ? value.schemaVersion : 0;

  if (sourceVersion <= CURRENT_SCHEMA_VERSION) {
    return { ...value, schemaVersion: CURRENT_SCHEMA_VERSION };
  }

  return {};
}

function parseSettings(value: unknown, defaults: PersistedSettings): PersistedSettings {
  if (!isRecord(value)) {
    return defaults;
  }

  const normalizedDomains = Array.isArray(value.selectedDomains)
    ? value.selectedDomains.flatMap((domain) => {
        if (typeof domain !== "string") {
          return [];
        }
        const result = normalizeDomain(domain);
        return result.ok ? [result.domain] : [];
      })
    : defaults.selectedDomains;

  return {
    selectedDomains: [...new Set(normalizedDomains)],
    manualBlockingEnabled:
      typeof value.manualBlockingEnabled === "boolean"
        ? value.manualBlockingEnabled
        : defaults.manualBlockingEnabled,
    focusDurationMinutes:
      typeof value.focusDurationMinutes === "number" &&
      isValidTimerDurationMinutes(value.focusDurationMinutes)
        ? value.focusDurationMinutes
        : defaults.focusDurationMinutes,
    killDurationMinutes:
      typeof value.killDurationMinutes === "number" &&
      isValidTimerDurationMinutes(value.killDurationMinutes)
        ? value.killDurationMinutes
        : defaults.killDurationMinutes,
    showBlockedPageStatus:
      typeof value.showBlockedPageStatus === "boolean"
        ? value.showBlockedPageStatus
        : defaults.showBlockedPageStatus,
  };
}

function parseTimer(value: unknown, defaults: PersistedTimerState): PersistedTimerState {
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    focus: parseFocusTimer(value.focus),
    kill: parseKillTimer(value.kill),
    lastTransitionAt: isFiniteNumber(value.lastTransitionAt) ? value.lastTransitionAt : null,
  };
}

function parseFocusTimer(value: unknown): FocusTimerState {
  if (!isRecord(value)) {
    return { status: "idle", endAt: null, remainingMilliseconds: null };
  }

  if (value.status === "running" && isFiniteNumber(value.endAt)) {
    return { status: "running", endAt: value.endAt, remainingMilliseconds: null };
  }
  if (value.status === "paused" && isPositiveFiniteNumber(value.remainingMilliseconds)) {
    return { status: "paused", endAt: null, remainingMilliseconds: value.remainingMilliseconds };
  }
  if (value.status === "completed" || value.status === "cancelled") {
    return { status: value.status, endAt: null, remainingMilliseconds: null };
  }

  return { status: "idle", endAt: null, remainingMilliseconds: null };
}

function parseKillTimer(value: unknown): KillTimerState {
  if (!isRecord(value)) {
    return { status: "idle", endAt: null };
  }

  if (value.status === "running" && isFiniteNumber(value.endAt)) {
    return { status: "running", endAt: value.endAt };
  }
  if (value.status === "completed") {
    return { status: "completed", endAt: null };
  }

  return { status: "idle", endAt: null };
}

function parseRuleState(value: unknown): PersistedRuleState {
  if (!isRecord(value) || !isRecord(value.domainRuleIds)) {
    return { domainRuleIds: {}, lastError: null };
  }

  const domainRuleIds: Record<string, number> = {};
  for (const [domain, id] of Object.entries(value.domainRuleIds)) {
    const normalized = normalizeDomain(domain);
    if (normalized.ok && isPositiveInteger(id)) {
      domainRuleIds[normalized.domain] = id;
    }
  }

  return {
    domainRuleIds,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNullableString(value: unknown, key: string): value is Record<string, string | null> {
  return isRecord(value) && (typeof value[key] === "string" || value[key] === null);
}
