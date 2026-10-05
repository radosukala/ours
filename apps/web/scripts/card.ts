/**
 * Render the link card (D-0024 §D): scripts/card.html, 1200 by 630, into
 * public/card.png, with a headless Chromium driven over the DevTools
 * protocol. The image is committed, so what a crawler is shown is what was
 * committed; this script only remakes it when the card changes.
 *
 *   CHROME_HEADLESS_SHELL=/path/to/chrome-headless-shell pnpm card
 *
 * It opens nothing but the local file, and talks to nothing but the
 * browser it starts.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHELL = process.env.CHROME_HEADLESS_SHELL;
const SOURCE = resolve("scripts/card.html");
const TARGET = resolve("public/card.png");

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

class Cdp {
  private next = 0;
  private pending = new Map<number, Pending>();
  private waiting: { method: string; resolve: () => void }[] = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; error?: { message: string }; result?: unknown; method?: string };
      if (message.id !== undefined) {
        const p = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) p?.reject(new Error(message.error.message));
        else p?.resolve(message.result);
        return;
      }
      this.waiting = this.waiting.filter((w) => {
        if (w.method !== message.method) return true;
        w.resolve();
        return false;
      });
    });
  }
  send(method: string, params: object = {}, sessionId?: string): Promise<unknown> {
    const id = ++this.next;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method: string): Promise<void> {
    return new Promise((resolve) => this.waiting.push({ method, resolve }));
  }
}

async function main(): Promise<void> {
  if (!SHELL) throw new Error("Set CHROME_HEADLESS_SHELL to a headless Chromium's path.");
  const profile = mkdtempSync(join(tmpdir(), "our-one-card-"));
  const child = spawn(SHELL, ["--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let seen = "";
      child.stderr.on("data", (chunk) => {
        seen += String(chunk);
        const found = /DevTools listening on (ws:\/\/\S+)/.exec(seen);
        if (found) resolve(found[1]!);
      });
      child.on("exit", (code) => reject(new Error(`the browser exited (${code})`)));
    });
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("the browser's socket failed")), { once: true });
    });
    const cdp = new Cdp(ws);
    const { targetId } = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
    const { sessionId } = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
    const page = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
    await page("Page.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.once("Page.loadEventFired");
    await page("Page.navigate", { url: pathToFileURL(SOURCE).href });
    await loaded;
    await page("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
    const { data } = (await page("Page.captureScreenshot", { format: "png" })) as { data: string };
    mkdirSync(dirname(TARGET), { recursive: true });
    writeFileSync(TARGET, Buffer.from(data, "base64"));
    ws.close();
    console.log(`Wrote ${TARGET} (1200×630).`);
  } finally {
    const gone = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill();
    await Promise.race([gone, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error("The card wasn't rendered:", error instanceof Error ? error.message : "an error");
  process.exitCode = 1;
});
