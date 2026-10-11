import { ALL_HOST_ORIGINS, getDomainOrigins } from "../background/domain-permissions.js";
import { normalizeDomain } from "../shared/domain.js";
import type { DashboardState, SettingsInput } from "../shared/contracts.js";
import { sendExtensionMessage } from "../shared/extension-client.js";

const STARTER_DOMAINS = [
  "instagram.com",
  "x.com",
  "facebook.com",
  "reddit.com",
  "youtube.com",
  "linkedin.com",
] as const;

const domainInput = document.getElementById("domain-input") as HTMLInputElement;
const addDomainButton = document.getElementById("add-domain") as HTMLButtonElement;
const domainFeedback = document.getElementById("domain-feedback") as HTMLParagraphElement;
const suggestionList = document.getElementById("suggestion-list") as HTMLDivElement;
const domainList = document.getElementById("domain-list") as HTMLDivElement;
const focusDuration = document.getElementById("focus-duration") as HTMLInputElement;
const killDuration = document.getElementById("kill-duration") as HTMLInputElement;
const showBlockedStatus = document.getElementById("show-blocked-status") as HTMLInputElement;
const saveSettingsButton = document.getElementById("save-settings") as HTMLButtonElement;
const saveFeedback = document.getElementById("save-feedback") as HTMLParagraphElement;
const grantBrowserAccessButton = document.getElementById("grant-browser-access") as HTMLButtonElement;
const permissionSummary = document.getElementById("permission-summary") as HTMLParagraphElement;
const ruleError = document.getElementById("rule-error") as HTMLParagraphElement;

let dashboardState: DashboardState | null = null;
let permissionMap = new Map<string, boolean>();
let hasBroadHostAccess = false;
let isBusy = false;
let autosaveTimer: number | null = null;
let autosaveQueued = false;

void bootstrap();

async function bootstrap(): Promise<void> {
  wireEvents();
  await refreshPage();
}

function wireEvents(): void {
  addDomainButton.addEventListener("click", () => {
    addDomain(domainInput.value);
  });

  domainInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDomain(domainInput.value);
    }
  });

  saveSettingsButton.addEventListener("click", () => {
    void saveSettings({ auto: false });
  });

  grantBrowserAccessButton.addEventListener("click", () => {
    void grantBrowserAccess();
  });

  focusDuration.addEventListener("input", () => {
    scheduleAutosave();
  });

  killDuration.addEventListener("input", () => {
    scheduleAutosave();
  });

  showBlockedStatus.addEventListener("change", () => {
    scheduleAutosave(0);
  });
}

async function refreshPage(): Promise<void> {
  const response = await sendExtensionMessage<DashboardState>({ type: "GET_DASHBOARD_STATE" });
  if (!response.ok) {
    saveFeedback.className = "status error";
    saveFeedback.textContent = `Unable to load settings: ${response.error}`;
    return;
  }

  dashboardState = response.data;
  hasBroadHostAccess = await chrome.permissions.contains({ origins: [...ALL_HOST_ORIGINS] });
  permissionMap = await loadPermissionMap(response.data.storageState.settings.selectedDomains);
  render();
}

function render(): void {
  if (dashboardState === null) {
    return;
  }

  const state = dashboardState.storageState;
  focusDuration.value = state.settings.focusDurationMinutes.toString();
  killDuration.value = state.settings.killDurationMinutes.toString();
  showBlockedStatus.checked = state.settings.showBlockedPageStatus;

  domainList.replaceChildren(
    ...state.settings.selectedDomains.map((domain) => createDomainItem(domain)),
  );
  suggestionList.replaceChildren(
    ...STARTER_DOMAINS.filter((domain) => !state.settings.selectedDomains.includes(domain)).map((domain) =>
      createSuggestionItem(domain),
    ),
  );

  if (state.settings.selectedDomains.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "No domains selected yet.";
    domainList.replaceChildren(empty);
  }

  grantBrowserAccessButton.disabled = isBusy || hasBroadHostAccess;
  permissionSummary.className = hasBroadHostAccess ? "status ok" : "status";
  permissionSummary.textContent = hasBroadHostAccess
    ? "Website access granted. Selected domains can be blocked without extra prompts."
    : "Website access is not granted yet. Saved domains will not block until you allow it.";

  ruleError.className = state.ruleState.lastError === null ? "status" : "status error";
  ruleError.textContent =
    state.ruleState.lastError === null
      ? "Dynamic rules are synchronized."
      : `Chrome rejected the latest rule update: ${state.ruleState.lastError}`;
}

function createDomainItem(domain: string): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "domain-item";

  const copy = document.createElement("div");
  copy.className = "domain-copy";

  const name = document.createElement("span");
  name.className = "domain-name";
  name.textContent = domain;

  const meta = document.createElement("span");
  meta.className = "domain-meta";
  meta.textContent = permissionMap.get(domain)
    ? "Ready to block."
    : "Saved, but inactive until website access is granted.";

  copy.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "row";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.textContent = "Remove";
  removeButton.disabled = isBusy;
  removeButton.addEventListener("click", () => {
    removeDomain(domain);
  });
  actions.append(removeButton);

  item.append(copy, actions);
  return item;
}

function createSuggestionItem(domain: string): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "suggestion-item";

  const copy = document.createElement("div");
  copy.className = "suggestion-copy";

  const name = document.createElement("span");
  name.className = "domain-name";
  name.textContent = domain;

  const meta = document.createElement("span");
  meta.className = "suggestion-meta";
  meta.textContent = "Suggested starter domain. This does not request permission until you do it explicitly.";
  copy.append(name, meta);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = "Add";
  button.disabled = isBusy;
  button.addEventListener("click", () => {
    addDomain(domain);
  });

  item.append(copy, button);
  return item;
}

function addDomain(rawValue: string): void {
  if (dashboardState === null) {
    return;
  }

  const normalized = normalizeDomain(rawValue);
  if (!normalized.ok) {
    domainFeedback.className = "status error";
    domainFeedback.textContent = normalized.error;
    return;
  }

  const selectedDomains = new Set(dashboardState.storageState.settings.selectedDomains);
  if (selectedDomains.has(normalized.domain)) {
    domainFeedback.className = "status";
    domainFeedback.textContent = `${normalized.domain} is already selected.`;
    domainInput.value = "";
    return;
  }

  selectedDomains.add(normalized.domain);
  dashboardState = {
    ...dashboardState,
    storageState: {
      ...dashboardState.storageState,
      settings: {
        ...dashboardState.storageState.settings,
        selectedDomains: [...selectedDomains].sort((first, second) => first.localeCompare(second)),
      },
    },
  };
  domainInput.value = "";
  domainFeedback.className = "status ok";
  domainFeedback.textContent = `${normalized.domain} added. Saving...`;
  render();
  scheduleAutosave(0);
}

function removeDomain(domain: string): void {
  if (dashboardState === null) {
    return;
  }

  dashboardState = {
    ...dashboardState,
    storageState: {
      ...dashboardState.storageState,
      settings: {
        ...dashboardState.storageState.settings,
        selectedDomains: dashboardState.storageState.settings.selectedDomains.filter((entry) => entry !== domain),
      },
    },
  };
  domainFeedback.className = "status";
  domainFeedback.textContent = `${domain} removed. Saving...`;
  render();
  scheduleAutosave(0);
}

async function grantBrowserAccess(): Promise<void> {
  if (isBusy) {
    return;
  }

  isBusy = true;
  render();

  try {
    const granted = await chrome.permissions.request({ origins: [...ALL_HOST_ORIGINS] });
    hasBroadHostAccess = granted;
    domainFeedback.className = granted ? "status ok" : "status error";
    domainFeedback.textContent = granted
      ? "Website access granted for selected domains."
      : "Website access was not granted.";
    await refreshPage();
  } finally {
    isBusy = false;
    render();
  }
}

function scheduleAutosave(delayMs = 400): void {
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
  }

  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    void saveSettings({ auto: true });
  }, delayMs);
}

async function saveSettings(options: { readonly auto: boolean }): Promise<void> {
  if (dashboardState === null) {
    return;
  }

  if (isBusy) {
    autosaveQueued = options.auto;
    return;
  }

  isBusy = true;
  if (!options.auto) {
    saveFeedback.className = "status";
    saveFeedback.textContent = "Saving settings...";
  }
  render();

  try {
    const settings: SettingsInput = {
      selectedDomains: dashboardState.storageState.settings.selectedDomains,
      focusDurationMinutes: readDurationInput(focusDuration, dashboardState.storageState.settings.focusDurationMinutes),
      killDurationMinutes: readDurationInput(killDuration, dashboardState.storageState.settings.killDurationMinutes),
      showBlockedPageStatus: showBlockedStatus.checked,
    };
    const response = await sendExtensionMessage<DashboardState["storageState"]>({
      type: "SAVE_SETTINGS",
      settings,
    });

    if (!response.ok) {
      saveFeedback.className = "status error";
      saveFeedback.textContent = describeSaveError(response.error);
      await refreshPage();
      return;
    }

    dashboardState = {
      storageState: response.data,
      effectiveBlocking: dashboardState.effectiveBlocking,
    };
    permissionMap = await loadPermissionMap(response.data.settings.selectedDomains);
    saveFeedback.className = "status ok";
    saveFeedback.textContent = options.auto ? "Settings saved automatically." : "Settings saved.";
    await refreshPage();
  } finally {
    isBusy = false;
    render();

    if (autosaveQueued) {
      autosaveQueued = false;
      scheduleAutosave(0);
    }
  }
}

async function loadPermissionMap(domains: readonly string[]): Promise<Map<string, boolean>> {
  const entries = await Promise.all(
    domains.map(async (domain) => {
      const granted = hasBroadHostAccess
        ? true
        : await chrome.permissions.contains({ origins: getDomainOrigins(domain) });
      return [domain, granted] as const;
    }),
  );
  return new Map(entries);
}

function readDurationInput(input: HTMLInputElement, fallback: number): number {
  const value = Number.parseInt(input.value, 10);
  const nextValue = Number.isInteger(value) ? value : fallback;
  return Math.min(480, Math.max(1, nextValue));
}
function describeSaveError(error: string): string {
  switch (error) {
    case "kill-timer-locked":
      return "A running kill timer blocks changes that would make selected sites available.";
    case "invalid-settings":
      return "One of the timer durations is invalid.";
    case "rule-update-failure":
      return "Chrome rejected the blocking rule update.";
    default:
      return `Unable to save settings: ${error}`;
  }
}
