/**
 * Request facts the core needs, reduced to what it needs.
 */
import { headers } from "next/headers";
import { rateKeyHash } from "@/core/limits";

/**
 * A keyed hash of the client's IP (see rateKeyHash), for rate-limit keys only; the IP itself is
 * never stored. It is the first value of x-forwarded-for, or "local" in
 * development.
 */
export async function clientIpHash(): Promise<string> {
  const list = (await headers()).get("x-forwarded-for");
  const first = list?.split(",")[0]?.trim();
  const ip =
    first || (process.env.NODE_ENV === "production" ? "unknown" : "local");
  return rateKeyHash(ip);
}
