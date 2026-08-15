import dns from "node:dns";
import { UserError } from "./errors";

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

function ipv4ToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (
    ((parts[0] << 24) >>> 0) +
    (parts[1] << 16) +
    (parts[2] << 8) +
    parts[3]
  );
}

function isIPv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(range) & mask);
}

// RFC 1918 / RFC 5735 / RFC 3927 reserved ranges, plus 169.254.169.254
// (the AWS/GCP/Azure cloud metadata endpoint — the single most common SSRF
// target) which falls inside the 169.254.0.0/16 link-local block.
const BLOCKED_IPV4_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local, includes 169.254.169.254 metadata
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24", // TEST-NET-1
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
  "255.255.255.255/32",
];

function isBlockedIPv4(ip: string): boolean {
  return BLOCKED_IPV4_RANGES.some((cidr) => isIPv4InCidr(ip, cidr));
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped address (e.g. ::ffff:169.254.169.254) — check the embedded IPv4
    const mapped = normalized.slice("::ffff:".length);
    if (mapped.includes(".")) return isBlockedIPv4(mapped);
  }
  if (normalized.startsWith("64:ff9b::")) return true; // NAT64
  return false;
}

export function isBlockedIp(address: string, family: number): boolean {
  return family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
}

/**
 * Resolves a hostname and throws a UserError if it — or any address it
 * resolves to — points at a private, loopback, link-local, or otherwise
 * internal/reserved address, including the cloud metadata endpoint.
 *
 * LIMITATION: this validates the address *before* the request is made; it
 * does not pin the TCP connection to that exact address. A fast DNS-rebind
 * (the record changes between this check and the actual fetch a moment
 * later) is not fully closed by this alone. Closing that gap requires a
 * custom fetch dispatcher that connects to the specific IP you validated
 * (e.g. undici's `Agent` with a `connect.lookup` override) rather than
 * letting the runtime re-resolve the hostname itself. This check is a
 * strong first layer and blocks the overwhelming majority of real-world
 * SSRF payloads (metadata endpoints, localhost, RFC1918 ranges); treat the
 * rebinding gap as a follow-up hardening step if this ever handles
 * higher-stakes or authenticated traffic.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();

  if (
    BLOCKED_HOSTNAMES.has(lower) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  ) {
    throw new UserError("That host isn't allowed.");
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UserError("Couldn't resolve that host.");
  }

  if (addresses.length === 0) {
    throw new UserError("Couldn't resolve that host.");
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr.address, addr.family)) {
      throw new UserError(
        "That URL points at a private or restricted network and can't be scanned."
      );
    }
  }
}
