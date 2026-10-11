import assert from "node:assert/strict";
import test from "node:test";
import { getDomainOrigins } from "../dist/background/domain-permissions.js";
import {
  expandBlockingDomains,
  normalizeDomain,
  toDomainUrlFilter,
} from "../dist/shared/domain.js";

test("valid hostnames normalize to lowercase canonical domains", () => {
  const normalized = normalizeDomain("WWW.Instagram.COM");
  assert.equal(normalized.ok, true);
  assert.equal(normalized.domain, "www.instagram.com");
  assert.equal(toDomainUrlFilter("instagram.com"), "||instagram.com^");
});

test("invalid domains are rejected", () => {
  assert.equal(normalizeDomain("https://instagram.com").ok, false);
  assert.equal(normalizeDomain("localhost").ok, false);
  assert.equal(normalizeDomain("192.168.0.1").ok, false);
  assert.equal(normalizeDomain("not a domain").ok, false);
});

test("x.com permission patterns cover apex and subdomains", () => {
  assert.deepEqual(getDomainOrigins("x.com"), [
    "http://x.com/*",
    "https://x.com/*",
    "http://*.x.com/*",
    "https://*.x.com/*",
  ]);
  assert.equal(toDomainUrlFilter("x.com"), "||x.com^");
});

test("x.com and twitter.com expand to the same blocking family", () => {
  assert.deepEqual(expandBlockingDomains(["x.com"]), ["twitter.com", "x.com"]);
  assert.deepEqual(expandBlockingDomains(["twitter.com"]), ["twitter.com", "x.com"]);
});
