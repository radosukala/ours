/**
 * The link card (D-0024 §E, M-0021): the image X, Facebook, Slack and
 * anything else that reads a page's card show when someone shares a link,
 * 1200 × 630, the headline on the paper.
 *
 *   pnpm --filter @ours/web card
 *
 * It is run by hand, and its output, public/card.png, is committed: the
 * build and the running site never run it, never need a browser, and
 * fetch nothing to show it. It reads no database, no network and no .env.
 *
 * - **The words are the site's.** The headline and the line under it come
 *   from `components/public/door.ts`, so the card can't say anything the
 *   front door doesn't. The colours are the front door's own tokens
 *   (src/app/globals.css); tests/first-screen.test.ts checks they agree.
 * - **It needs a headless browser,** the kind Playwright installs as
 *   `chromium_headless_shell`, or Puppeteer as `chrome-headless-shell`. Point
 *   CARD_BROWSER at one, or have Playwright's in its default place; it looks
 *   for nothing else. Another browser can be named, at the maker's risk: a
 *   plain Chrome lays the page out shorter than the window and can cut the
 *   card's foot, which the size check below can't see. Look at the card.
 * - **It cleans up after the browser has gone,** not when the browser's
 *   main process says it is going: the browser's helpers can still be
 *   writing to its profile folder then, and removing the folder under them
 *   fails or leaves it behind (M-0021's first build). It waits for the
 *   process to close, then removes the folder, retrying while it is busy.
 * - **It checks what it made** (a PNG, 1200 × 630, small enough for every
 *   service that reads it) before it replaces public/card.png, and writes
 *   the new file beside the old one and renames it, so a failed run leaves
 *   the old card as it was.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CARD, DOOR_HEADLINE, DOOR_START } from "../src/components/public/door";

/** The front door's tokens (src/app/globals.css, the `.public` block). */
export const CARD_COLOURS = {
  paper: "#f5f3eb",
  ink: "#222b24",
  sub: "#586157",
  rust: "#bf411d",
} as const;

/** The most a card may weigh: well under every service's limit (X's is 5 MB). */
export const CARD_MAX_BYTES = 400_000;

const OUT = fileURLToPath(new URL("../public/card.png", import.meta.url));

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The card as a page of its own: top-anchored, so no browser can cut it. */
export function cardHtml(): string {
  const [a, b, c, ours] = DOOR_HEADLINE;
  const { paper, ink, sub, rust } = CARD_COLOURS;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>our.one</title><style>
html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;background:${paper};color:${ink};overflow:hidden}
body{position:relative;font-family:"Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif}
.wm{position:absolute;left:82px;top:58px;font-size:42px;font-weight:700;letter-spacing:-0.07em}
.wm i{font-style:normal;color:${rust}}
h1{position:absolute;left:80px;top:150px;margin:0;font-size:112px;font-weight:500;line-height:.98;letter-spacing:-0.064em}
h1 span{display:block}
h1 em{color:${rust};font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:400;letter-spacing:-0.04em}
.foot{position:absolute;left:84px;top:540px;font-size:26px;color:${sub}}
</style></head><body>
<div class="wm">our<i>.</i>one</div>
<h1><span>${escapeHtml(a)}</span><span>${escapeHtml(b)}</span><span>${escapeHtml(c)} <em>${escapeHtml(ours)}</em></span></h1>
<div class="foot">${escapeHtml(DOOR_START.split(". ")[0]!)}.</div>
</body></html>
`;
}

/** The headless browser to use, or null: CARD_BROWSER, else Playwright's headless shell. */
export function findBrowser(env: Record<string, string | undefined> = process.env): string | null {
  const given = env.CARD_BROWSER?.trim();
  if (given) return existsSync(given) ? given : null;
  const root = env.PLAYWRIGHT_BROWSERS_PATH?.trim() || join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) return null;
  for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
    for (const rel of ["chrome-linux/headless_shell", "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-mac/headless_shell"]) {
      const path = join(root, dir, rel);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

/** Width and height of a PNG, from its header; null if it isn't one. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((v, i) => bytes[i] !== v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Run the browser until its process has closed, or kill it after `ms`. */
export function runBrowser(browser: string, args: string[], ms = 60_000): Promise<{ code: number | null; log: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"] });
    let log = "";
    child.stderr.on("data", (chunk: Buffer) => {
      log += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), ms);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    // "close", not "exit": it comes after the process's streams have ended too.
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, log });
    });
  });
}

/** Remove a folder the browser used, retrying while one of its helpers still holds it. */
export function removeFolder(dir: string): Promise<void> {
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}

export async function makeCard(env: Record<string, string | undefined> = process.env, out = OUT): Promise<{ bytes: number }> {
  const browser = findBrowser(env);
  if (!browser) {
    throw new Error(
      "No headless browser found. Set CARD_BROWSER to a chrome-headless-shell or Playwright's chromium_headless_shell binary.",
    );
  }
  const dir = await mkdtemp(join(tmpdir(), "our-one-card-"));
  try {
    const page = join(dir, "card.html");
    const shot = join(dir, "card.png");
    await writeFile(page, cardHtml(), "utf8");
    const args = [
      // Only a root user needs it (a container); anywhere else the sandbox stays on.
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${CARD.width},${CARD.height}`,
      `--user-data-dir=${join(dir, "profile")}`,
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      `--screenshot=${shot}`,
      pathToFileURL(page).href,
    ];
    const run = await runBrowser(browser, args);
    if (run.code !== 0) throw new Error(`The browser exited with code ${run.code}.`);
    const png = await readFile(shot);
    const size = pngSize(png);
    if (!size || size.width !== CARD.width || size.height !== CARD.height) {
      throw new Error(`The card is not ${CARD.width} × ${CARD.height}: ${size ? `${size.width} × ${size.height}` : "not a PNG"}.`);
    }
    if (png.length > CARD_MAX_BYTES) throw new Error(`The card weighs ${png.length} bytes; the most is ${CARD_MAX_BYTES}.`);
    const next = `${out}.new`;
    await writeFile(next, png);
    await rename(next, out);
    return { bytes: png.length };
  } finally {
    await removeFolder(dir);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeCard().then(
    ({ bytes }) => console.log(`Wrote public/card.png (${bytes} bytes).`),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : "The card could not be made.");
      process.exit(1);
    },
  );
}
