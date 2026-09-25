/**
 * Request facts the core needs, reduced to what it needs.
 */
import { isIP } from "node:net";
import { headers } from "next/headers";
import { clientIpHeader, isProduction } from "@/core/config";
import { rateKeyHash } from "@/core/limits";

/**
 * A keyed hash of the client's address (see rateKeyHash), for rate-limit
 * keys only; the address itself is never stored.
 *
 * The address is the first value of the header this deployment names in
 * CLIENT_IP_HEADER (SPEC §17 item 3): one its own proxy sets and a client
 * cannot write. In development the default is x-forwarded-for, and a
 * request without it is "local". In production with no header named, the
 * core refuses sign-in and join requests (CLOSED) whatever this returns; a
 * request that lacks the named header shares one "unknown" bucket.
 *
 * An IPv6 client is counted by its /64 (see `rateLimitAddress`).
 */
export async function clientIpHash(): Promise<string> {
  const header = clientIpHeader();
  const list = header ? (await headers()).get(header) : null;
  const first = list?.split(",")[0]?.trim();
  const ip = first || (isProduction() ? "unknown" : "local");
  return rateKeyHash(rateLimitAddress(ip));
}

/**
 * What one client is counted as. An IPv4 address is itself. An IPv6
 * address is its /64 prefix, written `a:b:c:d::/64`: one client normally
 * holds a whole /64 and can use a new address from it for every request,
 * so per-address limits on the full address would never be reached (the
 * second verification's identity defect 5). An IPv4 address written as
 * IPv6 (`::ffff:a.b.c.d`) is the IPv4 address. Anything else is used as
 * given.
 */
export function rateLimitAddress(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  const address = (bracketed ? bracketed[1]! : value).split("%")[0]!;
  if (isIP(address) !== 6) return value;
  const groups = ipv6Groups(address.toLowerCase());
  if (!groups) return value;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 address, or null. */
function ipv6Groups(address: string): number[] | null {
  let text = address;
  // A dotted IPv4 tail stands for the last two groups.
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (missing < 0) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail].map((g) =>
    Number.parseInt(g, 16),
  );
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}
