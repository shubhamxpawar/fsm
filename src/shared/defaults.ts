import {
  DEFAULT_FOCUS_DURATION_MINUTES,
  DEFAULT_KILL_DURATION_MINUTES,
} from "./timer.js";
import {
  CURRENT_SCHEMA_VERSION,
  type ExtensionStorageState,
} from "./schema.js";

export function createDefaultStorageState(): ExtensionStorageState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      selectedDomains: [],
      manualBlockingEnabled: false,
      focusDurationMinutes: DEFAULT_FOCUS_DURATION_MINUTES,
      killDurationMinutes: DEFAULT_KILL_DURATION_MINUTES,
      showBlockedPageStatus: true,
    },
    timer: {
      focus: {
        status: "idle",
        endAt: null,
        remainingMilliseconds: null,
      },
      kill: {
        status: "idle",
        endAt: null,
      },
      lastTransitionAt: null,
    },
    ruleState: {
      domainRuleIds: {},
      lastError: null,
    },
    contentState: {
      lastQuoteId: null,
    },
  };
}
