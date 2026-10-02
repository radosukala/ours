// Linden Tools: what each address does. It reaches the database only through the
// store's functions (src/data, the boundary), and sends email only through the mailer.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { STYLE } from "./html.js";
import * as pages from "./pages.js";

const MINUTE = 60 * 1000;
export const LINK_LIFETIME = 15 * MINUTE;
export const LINK_COOLDOWN = MINUTE;
export const SESSION_LIFETIME = 30 * 24 * 60 * MINUTE;
const COOKIE = "linden_session";
const MAX_FORM_BYTES = 16 * 1024;

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const hashOf = (value) => createHash("sha256").update(value).digest("hex");
const newCode = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Compares two texts in a time that doesn't depend on where they differ. */
function sameText(a, b) {
  return timingSafeEqual(createHash("sha256").update(String(a)).digest(), createHash("sha256").update(String(b)).digest());
}

export function cleanEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]+$/.test(email) ? email : null;
}

export function cleanText(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length >= 1 && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

/** Just the number, as Mira asked: "12", or "12a" where a house has a letter. */
export function cleanHouseNumber(value) {
  const text = String(value ?? "").trim();
  return /^[0-9]{1,4}[A-Za-z]?$/.test(text) ? text : null;
}

const NOTICES = {
  listed: "Listed.",
  removed: "Removed.",
  asked: "You asked to borrow it. The lender sees your request when they next look at their loans: Linden Tools sends no email about it.",
  lent: "Marked as lent.",
  declined: "Declined.",
  withdrawn: "Request withdrawn.",
  returned: "Marked as returned.",
};

const TOOL_OUTCOMES = {
  "not-found": [404, "No such tool", "That tool isn't listed any more."],
  "own-tool": [400, "That's your tool", "You can't borrow your own tool."],
  "already-asked": [409, "Already asked", "You've already asked for that tool."],
  "lent-out": [409, "It's lent out", "That tool is lent out. When it's back, mark it returned on Loans, then remove it."],
};

const LOAN_OUTCOMES = {
  "not-found": [404, "No such loan", "There's no such loan of yours."],
  "not-asked": [409, "Already answered", "That request isn't waiting for an answer any more."],
  "not-lent": [409, "Not lent out", "That tool isn't lent out."],
  "tool-out": [409, "It's lent out", "That tool is lent out already. Mark it returned first."],
};

const NOT_HERE = { title: "Not here", message: "That isn't something this page does." };

export function createApp({ store, mailer, config, clock = () => new Date() }) {
  const cookie = (value, maxAgeSeconds) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
    res.end(String(body));
  }

  function redirect(res, location, headers = {}) {
    res.writeHead(303, { ...SECURITY_HEADERS, Location: location, "Cache-Control": "no-store", ...headers });
    res.end();
  }

  function readCookie(req) {
    for (const part of String(req.headers.cookie ?? "").split(";")) {
      const i = part.indexOf("=");
      if (i !== -1 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim() || null;
    }
    return null;
  }

  /** A form's fields, or null if it isn't a form or is too large. */
  function readForm(req) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const chunks = [];
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size <= MAX_FORM_BYTES) chunks.push(chunk);
      });
      req.on("end", () => {
        const ok = type === "application/x-www-form-urlencoded" && size <= MAX_FORM_BYTES;
        resolve(ok ? new URLSearchParams(Buffer.concat(chunks).toString("utf8")) : null);
      });
      req.on("error", reject);
    });
  }

  // Signing in and joining, by a link sent by email ---------------------------

  function coolingDown(email, now) {
    const last = store.lastSignInLinkAt(email);
    return last !== null && now.getTime() - last.getTime() < LINK_COOLDOWN;
  }

  async function sendLink(email, purpose, now) {
    const code = newCode();
    store.saveSignInLink({ tokenHash: hashOf(code), email, purpose }, now, LINK_LIFETIME);
    const joining = purpose === "join";
    try {
      await mailer.send({
        to: email,
        subject: joining ? "Your link to join Linden Tools" : "Your sign-in link for Linden Tools",
        text: [
          joining ? "Here is your link to join Linden Tools:" : "Here is your link to sign in to Linden Tools:",
          "",
          `${config.baseUrl}/link?token=${code}`,
          "",
          "It works once, within 15 minutes. If you didn't ask for it, you can ignore this email.",
        ].join("\n"),
      });
    } catch (error) {
      // The page says the same either way, so a failure can't tell anyone who has joined.
      // The log names no address; the unused link expires in 15 minutes.
      console.error(`Linden Tools: a sign-in email wasn't sent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function signIn(req, res, now) {
    const form = await readForm(req);
    const email = cleanEmail(form?.get("email"));
    if (!email) return send(res, 400, pages.startPage({ signInError: "That doesn't look like an email address.", values: { signInEmail: form?.get("email") ?? "" } }));
    // The same answer whether or not the address has joined, so the page doesn't tell who has.
    if (store.findPersonByEmail(email) && !coolingDown(email, now)) await sendLink(email, "sign-in", now);
    return send(res, 200, pages.checkEmailPage({ email }));
  }

  async function join(req, res, now) {
    const form = await readForm(req);
    const email = cleanEmail(form?.get("email"));
    const values = { joinEmail: form?.get("email") ?? "" };
    if (!email) return send(res, 400, pages.startPage({ joinError: "That doesn't look like an email address.", values }));
    if (!sameText(String(form.get("code") ?? "").trim(), config.streetCode)) return send(res, 400, pages.startPage({ joinError: "That street code isn't right.", values }));
    if (!coolingDown(email, now)) await sendLink(email, store.findPersonByEmail(email) ? "sign-in" : "join", now);
    return send(res, 200, pages.checkEmailPage({ email }));
  }

  // A link only shows a page; the button on it uses the link, so a mail scanner that opens it uses nothing.
  function showLink(url, res, now) {
    const code = url.searchParams.get("token") ?? "";
    const link = code ? store.peekSignInLink(hashOf(code), now) : null;
    if (!link) return send(res, 400, pages.linkExpiredPage());
    return send(res, 200, pages.linkPage({ purpose: link.purpose, token: code }));
  }

  async function useLink(req, res, now) {
    const form = await readForm(req);
    const code = String(form?.get("token") ?? "");
    const waiting = code ? store.peekSignInLink(hashOf(code), now) : null;
    if (!waiting) return send(res, 400, pages.linkExpiredPage());
    let details = null;
    if (waiting.purpose === "join") {
      const name = cleanText(form.get("name"), 60);
      const houseNumber = cleanHouseNumber(form.get("houseNumber"));
      if (!name || !houseNumber) {
        const error = !name ? "Please write your name, up to 60 characters." : "Please write just your house number, such as 12 or 12a.";
        return send(res, 400, pages.linkPage({ purpose: "join", token: code, error, values: { name: form.get("name") ?? "", houseNumber: form.get("houseNumber") ?? "" } }));
      }
      details = { name, houseNumber };
    }
    const link = store.takeSignInLink(hashOf(code), now);
    if (!link) return send(res, 400, pages.linkExpiredPage());
    let person = store.findPersonByEmail(link.email);
    if (!person) {
      if (link.purpose !== "join" || !details) return send(res, 400, pages.linkExpiredPage());
      person = store.createPerson({ name: details.name, email: link.email, houseNumber: details.houseNumber }, now);
    }
    const sessionCode = newCode();
    store.createSession({ tokenHash: hashOf(sessionCode), personId: person.id, csrf: newCode(24) }, now, SESSION_LIFETIME);
    return redirect(res, "/tools", { "Set-Cookie": cookie(sessionCode, SESSION_LIFETIME / 1000) });
  }

  // Pages for neighbours who have signed in -----------------------------------

  const noticeFrom = (url) => NOTICES[url.searchParams.get("done") ?? ""] ?? null;
  const openLoans = (person) => store.loansFor(person.id).filter((l) => l.status === "asked" || l.status === "lent");

  function showTools(res, person, csrf, extra = {}, status = 200) {
    return send(res, status, pages.toolsPage({ person, csrf, neighbours: store.listNeighbours(), ...extra }));
  }

  function download(res, person, now) {
    const data = store.exportPerson(person.id, now);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="linden-tools-${now.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    });
    res.end(`${JSON.stringify(data, null, 2)}\n`);
  }

  async function route(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const now = clock();

    if (path === "/style.css" && method === "GET") {
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      res.end(STYLE);
      return;
    }

    const sessionCode = readCookie(req);
    const session = sessionCode ? store.sessionFor(hashOf(sessionCode), now) : null;
    const person = session?.person ?? null;

    if (path === "/") {
      if (method !== "GET") return send(res, 405, pages.messagePage({ person, ...NOT_HERE }));
      return person ? redirect(res, "/tools") : send(res, 200, pages.startPage());
    }
    if (path === "/sign-in" && method === "POST") return signIn(req, res, now);
    if (path === "/join" && method === "POST") return join(req, res, now);
    if (path === "/link" && method === "GET") return showLink(url, res, now);
    if (path === "/link" && method === "POST") return useLink(req, res, now);

    const toolAction = /^\/tools\/(\d{1,12})\/(ask|remove)$/.exec(path);
    const loanAction = /^\/loans\/(\d{1,12})\/(lend|decline|withdraw|returned)$/.exec(path);
    const memberPaths = ["/tools", "/loans", "/account", "/account/download", "/account/delete", "/sign-out"];
    if (!memberPaths.includes(path) && !toolAction && !loanAction) {
      return send(res, 404, pages.messagePage({ person, title: "Nothing here", message: "There's no page at that address." }));
    }
    // Everything from here on is for neighbours who have signed in.
    if (!person) return redirect(res, "/");
    const { csrf } = session;

    if (method === "GET") {
      if (path === "/tools") return showTools(res, person, csrf, { notice: noticeFrom(url) });
      if (path === "/loans") return send(res, 200, pages.loansPage({ person, csrf, loans: store.loansFor(person.id), notice: noticeFrom(url) }));
      if (path === "/account") return send(res, 200, pages.accountPage({ person, csrf }));
      if (path === "/account/download") return download(res, person, now);
      if (path === "/account/delete") return send(res, 200, pages.deletePage({ person, csrf, openLoans: openLoans(person) }));
    }
    if (method !== "POST") return send(res, 405, pages.messagePage({ person, ...NOT_HERE }));

    const form = await readForm(req);
    if (!form || !sameText(form.get("csrf") ?? "", csrf)) {
      return send(res, 403, pages.messagePage({ person, title: "Please try again", message: "That form had expired. Go back, reload the page, and try again." }));
    }

    if (path === "/tools") {
      const name = cleanText(form.get("name"), 80);
      if (!name) return showTools(res, person, csrf, { error: "Please write the tool's name, up to 80 characters.", values: { name: form.get("name") ?? "" } }, 400);
      store.addTool(person.id, name, now);
      return redirect(res, "/tools?done=listed");
    }
    if (toolAction) {
      const toolId = Number(toolAction[1]);
      const outcome = toolAction[2] === "ask" ? store.askToBorrow(person.id, toolId, now) : store.removeTool(person.id, toolId, now);
      if (outcome === "asked") return redirect(res, "/loans?done=asked");
      if (outcome === "removed") return redirect(res, "/tools?done=removed");
      const [status, title, message] = TOOL_OUTCOMES[outcome];
      return send(res, status, pages.messagePage({ person, title, message }));
    }
    if (loanAction) {
      const act = { lend: store.lend, decline: store.decline, withdraw: store.withdraw, returned: store.markReturned }[loanAction[2]];
      const outcome = act(person.id, Number(loanAction[1]), now);
      if (LOAN_OUTCOMES[outcome]) {
        const [status, title, message] = LOAN_OUTCOMES[outcome];
        return send(res, status, pages.messagePage({ person, title, message }));
      }
      return redirect(res, `/loans?done=${outcome}`);
    }
    if (path === "/account/delete") {
      if (form.get("confirm") !== "yes") return send(res, 400, pages.deletePage({ person, csrf, openLoans: openLoans(person), error: "Tick the box to confirm." }));
      store.deletePerson(person.id);
      return send(res, 200, pages.deletedPage(), { "Set-Cookie": cookie("", 0) });
    }
    if (path === "/sign-out") {
      store.endSession(hashOf(sessionCode));
      return redirect(res, "/", { "Set-Cookie": cookie("", 0) });
    }
    return send(res, 405, pages.messagePage({ person, ...NOT_HERE }));
  }

  return async function handle(req, res) {
    try {
      await route(req, res);
    } catch (error) {
      console.error(`Linden Tools: a request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) send(res, 500, pages.messagePage({ title: "Something went wrong", message: "Please try again in a moment." }));
      else res.end();
    }
  };
}
