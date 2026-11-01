import ipaddr from "ipaddr.js";

const INTERNAL_SUFFIXES = new Set([
  "localhost",
  "local",
  "internal",
  "lan",
  "home",
  "corp",
  "private",
  "intranet",
  "test",
  "invalid",
  "example",
  "onion",
  "arpa",
]);

const GLOBALLY_REACHABLE_IPV4_EXCEPTIONS = [
  ipaddr.parseCIDR("192.0.0.9/32"),
  ipaddr.parseCIDR("192.0.0.10/32"),
];

// IANA reserved 3ff0::/13 for future allocation, while the current ipaddr.js
// classifier treats part of that block as ordinary unicast.
const IPV6_RESERVED_FUTURE_ALLOCATION = ipaddr.parseCIDR("3ff0::/13");

const isPublicIpAddress = (address: string) => {
  let parsed: ReturnType<typeof ipaddr.process>;
  try {
    parsed = ipaddr.process(address);
  } catch {
    return false;
  }

  if (
    parsed.kind() === "ipv6" &&
    parsed.match(IPV6_RESERVED_FUTURE_ALLOCATION)
  ) {
    return false;
  }

  if (parsed.range() === "unicast") return true;
  return (
    parsed.kind() === "ipv4" &&
    GLOBALLY_REACHABLE_IPV4_EXCEPTIONS.some((range) => parsed.match(range))
  );
};

export const isPublicHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const address = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;

  if (ipaddr.isValid(address)) return isPublicIpAddress(address);
  if (normalized.length > 253) return false;

  const labels = normalized.split(".");
  const topLevelLabel = labels.at(-1) ?? "";
  if (labels.length < 2 || INTERNAL_SUFFIXES.has(topLevelLabel)) return false;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(topLevelLabel)) return false;
  if (topLevelLabel.length < 2 || /^\d+$/.test(topLevelLabel)) return false;
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
};

/** Strict production origin parser shared by invitation links and Auth. */
export const parseProductionOrigin = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    if (/[\u0000-\u0020]/.test(value)) return null;
    const url = new URL(value);
    const schemeEnd = value.indexOf("://");
    const authority = schemeEnd >= 0
      ? value.slice(schemeEnd + 3).split(/[/?#]/, 1)[0]
      : "";
    if (
      url.protocol !== "https:" ||
      authority.includes("@") ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash ||
      !isPublicHostname(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};
