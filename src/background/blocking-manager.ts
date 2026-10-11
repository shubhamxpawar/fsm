import { getEffectiveBlockingState } from "../shared/blocking-policy.js";
import { expandBlockingDomains, toDomainUrlFilter } from "../shared/domain.js";
import type { ExtensionStorageState } from "../shared/schema.js";
import { allocateDomainRuleIds, MAX_DYNAMIC_RULE_ID, MIN_DYNAMIC_RULE_ID } from "./rule-ids.js";
import { DomainPermissions, type DomainPermissionStatus } from "./domain-permissions.js";

const BLOCKED_PAGE_PATH = "/blocked/blocked.html";
const MAIN_FRAME_RESOURCE_TYPE = chrome.declarativeNetRequest.ResourceType.MAIN_FRAME;

export interface ReconcileSuccess {
  readonly ok: true;
  readonly state: ExtensionStorageState;
  readonly permissionStatuses: readonly DomainPermissionStatus[];
}

export interface ReconcileFailure {
  readonly ok: false;
  readonly state: ExtensionStorageState;
  readonly error: "rule-update-failure";
  readonly detail: string;
}

export type ReconcileResult = ReconcileSuccess | ReconcileFailure;

/** Keeps Chrome's dynamic rules exactly aligned with authoritative stored state. */
export class BlockingManager {
  constructor(private readonly permissions = new DomainPermissions()) {}

  async reconcile(state: ExtensionStorageState, now = Date.now()): Promise<ReconcileResult> {
    const nextState: ExtensionStorageState = {
      ...state,
      ruleState: {
        domainRuleIds: allocateDomainRuleIds(
          state.ruleState.domainRuleIds,
          expandBlockingDomains(state.settings.selectedDomains),
        ),
        lastError: null,
      },
    };
    const permissionStatuses = await this.permissions.getStatuses(nextState.settings.selectedDomains);
    const permittedDomains = expandBlockingDomains(
      permissionStatuses.filter((status) => status.granted).map((status) => status.domain),
    );
    const effectiveBlocking = getEffectiveBlockingState(nextState, now);
    const desiredRules = effectiveBlocking.isBlocked
      ? createBlockingRules(nextState, permittedDomains)
      : [];

    try {
      await updateOwnedDynamicRules(desiredRules);
      return { ok: true, state: nextState, permissionStatuses };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Chrome rejected the dynamic rule update.";
      return {
        ok: false,
        state: {
          ...state,
          ruleState: {
            ...state.ruleState,
            lastError: detail,
          },
        },
        error: "rule-update-failure",
        detail,
      };
    }
  }
}

export function createBlockingRules(
  state: ExtensionStorageState,
  domains: readonly string[],
): chrome.declarativeNetRequest.Rule[] {
  return domains.flatMap((domain) => {
    const id = state.ruleState.domainRuleIds[domain];
    if (id === undefined) {
      return [];
    }

    return [
      {
        id,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: BLOCKED_PAGE_PATH },
        },
        condition: {
          // DNR's domain anchor covers both the apex hostname and its
          // subdomains. It is deliberately used instead of regexFilter:
          // Chrome's regex engine rejects look-around expressions and a
          // rejected rule update removes every existing blocking rule.
          urlFilter: toDomainUrlFilter(domain),
          resourceTypes: [MAIN_FRAME_RESOURCE_TYPE],
        },
      },
    ];
  });
}

async function updateOwnedDynamicRules(
  desiredRules: readonly chrome.declarativeNetRequest.Rule[],
): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingOwnedRules = existingRules.filter(isOwnedBlockingRule);
  const desiredById = new Map(desiredRules.map((rule) => [rule.id, rule]));
  const existingById = new Map(existingOwnedRules.map((rule) => [rule.id, rule]));
  const removeRuleIds = existingOwnedRules
    .filter((rule) => {
      const desired = desiredById.get(rule.id);
      return desired === undefined || !areRulesEqual(rule, desired);
    })
    .map((rule) => rule.id);
  const addRules = desiredRules.filter((rule) => {
    const existing = existingById.get(rule.id);
    return existing === undefined || !areRulesEqual(existing, rule);
  });

  if (removeRuleIds.length === 0 && addRules.length === 0) {
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

function isOwnedBlockingRule(rule: chrome.declarativeNetRequest.Rule): boolean {
  return (
    rule.id >= MIN_DYNAMIC_RULE_ID &&
    rule.id <= MAX_DYNAMIC_RULE_ID &&
    rule.action.type === "redirect" &&
    rule.action.redirect?.extensionPath === BLOCKED_PAGE_PATH &&
    (typeof rule.condition.regexFilter === "string" ||
      typeof rule.condition.urlFilter === "string") &&
    rule.condition.resourceTypes?.length === 1 &&
    rule.condition.resourceTypes[0] === MAIN_FRAME_RESOURCE_TYPE
  );
}

function areRulesEqual(
  first: chrome.declarativeNetRequest.Rule,
  second: chrome.declarativeNetRequest.Rule,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
