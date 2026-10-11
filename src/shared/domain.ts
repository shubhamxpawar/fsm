export type DomainValidationError =
  | "empty"
  | "not-a-hostname"
  | "contains-url-components"
  | "ip-address-not-supported"
  | "local-host-not-supported"
  | "invalid-label"
  | "invalid-top-level-domain";

export type NormalizeDomainResult =
  | { readonly ok: true; readonly domain: string }
  | { readonly ok: false; readonly error: DomainValidationError };

const MAX_HOSTNAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const IPV6_PATTERN = /^[0-9a-f:]+$/iu;
const HOSTNAME_LABEL_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;
const TOP_LEVEL_DOMAIN_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/u;
const BLOCKING_DOMAIN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "twitter.com": ["x.com"],
  "x.com": ["twitter.com"],
};

/**
 * Produces the canonical hostname that the blocking engine owns. User input is
 * deliberately restricted to a hostname, so a selected domain can never
 * accidentally mean one path, protocol, account, or lookalike site.
 */
export function normalizeDomain(input: string): NormalizeDomainResult {
  const domain = input.trim().toLowerCase();

  if (domain.length === 0) {
    return { ok: false, error: "empty" };
  }

  if (containsUrlComponents(domain)) {
    return { ok: false, error: "contains-url-components" };
  }

  if (domain === "localhost" || domain.endsWith(".localhost")) {
    return { ok: false, error: "local-host-not-supported" };
  }

  if (IPV4_PATTERN.test(domain) || IPV6_PATTERN.test(domain)) {
    return { ok: false, error: "ip-address-not-supported" };
  }

  if (domain.length > MAX_HOSTNAME_LENGTH || domain.endsWith(".")) {
    return { ok: false, error: "not-a-hostname" };
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !isValidLabel(label))) {
    return { ok: false, error: "invalid-label" };
  }

  const topLevelDomain = labels.at(-1);
  if (topLevelDomain === undefined || !TOP_LEVEL_DOMAIN_PATTERN.test(topLevelDomain)) {
    return { ok: false, error: "invalid-top-level-domain" };
  }

  return { ok: true, domain };
}

/**
 * A DNR domain anchor includes the selected hostname and every subdomain, but
 * not lookalikes such as notfacebook.com when facebook.com is selected.
 */
export function toDomainUrlFilter(domain: string): string {
  return `||${domain}^`;
}

export function expandBlockingDomains(domains: readonly string[]): string[] {
  const expanded = new Set<string>();

  for (const domain of domains) {
    expanded.add(domain);

    for (const alias of BLOCKING_DOMAIN_ALIASES[domain] ?? []) {
      expanded.add(alias);
    }
  }

  return [...expanded].sort((first, second) => first.localeCompare(second));
}

function containsUrlComponents(value: string): boolean {
  return (
    value.includes("://") ||
    value.includes("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("@") ||
    value.includes(":")
  );
}

function isValidLabel(label: string): boolean {
  return label.length <= MAX_LABEL_LENGTH && HOSTNAME_LABEL_PATTERN.test(label);
}
