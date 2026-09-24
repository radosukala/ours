/**
 * Request facts the core needs, reduced to what it needs.
 */
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
 */
export async function clientIpHash(): Promise<string> {
  const header = clientIpHeader();
  const list = header ? (await headers()).get(header) : null;
  const first = list?.split(",")[0]?.trim();
  const ip = first || (isProduction() ? "unknown" : "local");
  return rateKeyHash(ip);
}
