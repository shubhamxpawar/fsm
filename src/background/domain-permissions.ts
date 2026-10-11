import { normalizeDomain } from "../shared/domain.js";

export interface DomainPermissionStatus {
  readonly domain: string;
  readonly granted: boolean;
}

export const ALL_HOST_ORIGINS = ["http://*/*", "https://*/*"] as const;

export function getDomainOrigins(domain: string): string[] {
  return [
    `http://${domain}/*`,
    `https://${domain}/*`,
    `http://*.${domain}/*`,
    `https://*.${domain}/*`,
  ];
}

export class DomainPermissions {
  async request(domainInput: string): Promise<DomainPermissionStatus> {
    const domain = requireNormalizedDomain(domainInput);
    const origins = getDomainOrigins(domain);
    const granted = await chrome.permissions.request({ origins });

    return { domain, granted };
  }

  async requestAllHosts(): Promise<boolean> {
    return chrome.permissions.request({ origins: [...ALL_HOST_ORIGINS] });
  }

  async hasAllHosts(): Promise<boolean> {
    return chrome.permissions.contains({ origins: [...ALL_HOST_ORIGINS] });
  }

  async contains(domain: string): Promise<boolean> {
    if (await this.hasAllHosts()) {
      return true;
    }

    return chrome.permissions.contains({ origins: getDomainOrigins(domain) });
  }

  async getStatuses(domains: readonly string[]): Promise<DomainPermissionStatus[]> {
    return Promise.all(
      domains.map(async (domain) => ({ domain, granted: await this.contains(domain) })),
    );
  }
}

function requireNormalizedDomain(domainInput: string): string {
  const normalized = normalizeDomain(domainInput);
  if (!normalized.ok) {
    throw new TypeError(`Cannot request host access for an invalid domain: ${normalized.error}`);
  }

  return normalized.domain;
}
