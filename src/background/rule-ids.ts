export const MIN_DYNAMIC_RULE_ID = 10_000;
export const MAX_DYNAMIC_RULE_ID = 999_999;

export type DomainRuleIds = Readonly<Record<string, number>>;

/**
 * Allocates durable DNR IDs from a private extension range. Existing IDs are
 * retained and hash collisions are resolved deterministically by probing.
 */
export function allocateDomainRuleIds(
  currentIds: DomainRuleIds,
  domains: readonly string[],
): DomainRuleIds {
  const selectedDomains = [...new Set(domains)].sort();
  const selectedDomainSet = new Set(selectedDomains);
  const retainedEntries = Object.entries(currentIds).filter(
    ([domain, id]) => selectedDomainSet.has(domain) && isManagedRuleId(id),
  );
  const nextIds: Record<string, number> = Object.fromEntries(retainedEntries);
  const usedIds = new Set(Object.values(nextIds));

  for (const domain of selectedDomains) {
    if (nextIds[domain] === undefined) {
      nextIds[domain] = findAvailableRuleId(domain, usedIds);
      usedIds.add(nextIds[domain]);
    }
  }

  return nextIds;
}

function findAvailableRuleId(domain: string, usedIds: ReadonlySet<number>): number {
  const rangeSize = MAX_DYNAMIC_RULE_ID - MIN_DYNAMIC_RULE_ID + 1;
  const initialOffset = hashDomain(domain) % rangeSize;

  for (let offset = 0; offset < rangeSize; offset += 1) {
    const candidate = MIN_DYNAMIC_RULE_ID + ((initialOffset + offset) % rangeSize);
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }

  throw new RangeError("No dynamic rule IDs remain in the extension-owned range.");
}

function isManagedRuleId(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_DYNAMIC_RULE_ID && value <= MAX_DYNAMIC_RULE_ID;
}

function hashDomain(domain: string): number {
  let hash = 2_166_136_261;

  for (const character of domain) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
