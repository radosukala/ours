// Linden Tools over HTTP, as a browser would use it. Every person here is fictional,
// and no email is sent: the mailer only records what it would send.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { openStore } from "../src/data/store.js";

const STREET_CODE = "linden-row-test-code";
const MINUTE = 60 * 1000;

async function street(t, { failMail = false } = {}) {
  let now = new Date("2026-10-03T10:00:00Z");
  const sent = [];
  const store = openStore(":memory:");
  const config = readConfig({ STREET_CODE, BASE_URL: "http://localhost:3000" });
  assert.deepEqual(config.problems, []);
  const mailer = {
    send: async (message) => {
      if (failMail) throw new Error("Resend didn't accept the email (HTTP 403).");
      sent.push(message);
    },
  };
  const server = createServer(createApp({ store, mailer, config, clock: () => now }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = async (path, { method = "GET", form, cookie } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + path, { method, headers, body, redirect: "manual" });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  const lastLink = () => /\/link\?token=([\w-]+)/.exec(sent.at(-1).text)[1];
  const join = async (email, name, houseNumber) => {
    const before = sent.length;
    assert.equal((await request("/join", { method: "POST", form: { email, code: STREET_CODE } })).status, 200);
    assert.equal(sent.length, before + 1);
    const done = await request("/link", { method: "POST", form: { token: lastLink(), name, houseNumber } });
    assert.equal(done.status, 303);
    const cookie = done.headers.getSetCookie()[0].split(";")[0];
    const page = await request("/tools", { cookie });
    const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)[1];
    return { cookie, csrf };
  };
  const advance = (ms) => {
    now = new Date(now.getTime() + ms);
  };
  return { request, join, lastLink, advance, sent, store };
}

test("joining takes the street code and a link sent by email", async (t) => {
  const s = await street(t);
  const wrong = await s.request("/join", { method: "POST", form: { email: "ada@example.test", code: "not-the-code" } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.text, /That street code isn&#39;t right|That street code isn't right/);
  assert.equal(s.sent.length, 0);

  const right = await s.request("/join", { method: "POST", form: { email: "Ada@Example.test", code: STREET_CODE } });
  assert.equal(right.status, 200);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].to, "ada@example.test");
  const token = s.lastLink();

  const page = await s.request(`/link?token=${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Your house number, just the number/);
  const notJustANumber = await s.request("/link", { method: "POST", form: { token, name: "Ada Fictional", houseNumber: "4 Linden Row" } });
  assert.equal(notJustANumber.status, 400);

  const done = await s.request("/link", { method: "POST", form: { token, name: "Ada Fictional", houseNumber: "4" } });
  assert.equal(done.status, 303);
  assert.equal(done.headers.get("location"), "/tools");
  const cookie = done.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const again = await s.request("/link", { method: "POST", form: { token, name: "Ada Fictional", houseNumber: "4" } });
  assert.equal(again.status, 400, "a link works once");
});

test("signing in says the same for any address, and only members get a link", async (t) => {
  const s = await street(t);
  await s.join("ada@example.test", "Ada Fictional", "4");
  const count = s.sent.length;
  const stranger = await s.request("/sign-in", { method: "POST", form: { email: "nobody@example.test" } });
  const member = await s.request("/sign-in", { method: "POST", form: { email: "ada@example.test" } });
  assert.equal(stranger.status, 200);
  assert.equal(member.status, 200);
  assert.equal(stranger.text.replace("nobody@example.test", "X"), member.text.replace("ada@example.test", "X"));
  assert.equal(s.sent.length, count + 1);
  assert.equal(s.sent.at(-1).to, "ada@example.test");
  await s.request("/sign-in", { method: "POST", form: { email: "ada@example.test" } });
  assert.equal(s.sent.length, count + 1, "one link a minute at most");
  s.advance(MINUTE);
  await s.request("/sign-in", { method: "POST", form: { email: "ada@example.test" } });
  assert.equal(s.sent.length, count + 2);
});

test("a link stops working after 15 minutes", async (t) => {
  const s = await street(t);
  await s.request("/join", { method: "POST", form: { email: "ada@example.test", code: STREET_CODE } });
  const token = s.lastLink();
  s.advance(15 * MINUTE);
  assert.equal((await s.request(`/link?token=${token}`)).status, 400);
  assert.equal((await s.request("/link", { method: "POST", form: { token, name: "Ada Fictional", houseNumber: "4" } })).status, 400);
});

test("pages for neighbours need signing in, and every form needs its token", async (t) => {
  const s = await street(t);
  for (const path of ["/tools", "/loans", "/account", "/account/download", "/account/delete"]) {
    const r = await s.request(path);
    assert.equal(r.status, 303, path);
    assert.equal(r.headers.get("location"), "/");
  }
  const ada = await s.join("ada@example.test", "Ada Fictional", "4");
  assert.equal((await s.request("/tools", { method: "POST", cookie: ada.cookie, form: { name: "Drill" } })).status, 403);
  assert.equal((await s.request("/tools", { method: "POST", cookie: ada.cookie, form: { name: "Drill", csrf: "a-guess" } })).status, 403);
  assert.equal((await s.request("/account/delete", { method: "POST", cookie: ada.cookie, form: { confirm: "yes" } })).status, 403);
  assert.equal(s.store.counts().tools, 0);
  assert.equal(s.store.counts().people, 1);
});

test("lending: one neighbour asks, the lender lends and marks it back, and a third never sees the loan", async (t) => {
  const s = await street(t);
  const ada = await s.join("ada@example.test", "Ada Fictional", "4");
  const ben = await s.join("ben@example.test", "Ben Fictional", "12");
  const cleo = await s.join("cleo@example.test", "Cleo Fictional", "27");
  assert.equal((await s.request("/tools", { method: "POST", cookie: ada.cookie, form: { name: "Pressure washer", csrf: ada.csrf } })).status, 303);

  const cleoTools = await s.request("/tools", { cookie: cleo.cookie });
  assert.match(cleoTools.text, /Ada Fictional, number 4/);
  assert.match(cleoTools.text, /Pressure washer/);
  assert.ok(!cleoTools.text.includes("@example.test"), "no email address on the tools page");
  const toolId = /action="\/tools\/(\d+)\/ask"/.exec(cleoTools.text)[1];

  const asked = await s.request(`/tools/${toolId}/ask`, { method: "POST", cookie: ben.cookie, form: { csrf: ben.csrf } });
  assert.equal(asked.status, 303);
  assert.equal(asked.headers.get("location"), "/loans?done=asked");
  const adaLoans = await s.request("/loans", { cookie: ada.cookie });
  assert.match(adaLoans.text, /Ben Fictional, number 12 asks to borrow your Pressure washer/);
  const loanId = /action="\/loans\/(\d+)\/lend"/.exec(adaLoans.text)[1];

  assert.ok(!(await s.request("/loans", { cookie: cleo.cookie })).text.includes("Pressure washer"), "a third neighbour doesn't see the loan");
  assert.equal((await s.request(`/loans/${loanId}/lend`, { method: "POST", cookie: cleo.cookie, form: { csrf: cleo.csrf } })).status, 404);
  assert.equal((await s.request(`/loans/${loanId}/lend`, { method: "POST", cookie: ben.cookie, form: { csrf: ben.csrf } })).status, 404);
  assert.equal((await s.request(`/loans/${loanId}/lend`, { method: "POST", cookie: ada.cookie, form: { csrf: ada.csrf } })).status, 303);
  assert.match((await s.request("/loans", { cookie: ben.cookie })).text, /You have Ada Fictional, number 4's Pressure washer/);

  assert.equal((await s.request(`/loans/${loanId}/returned`, { method: "POST", cookie: ben.cookie, form: { csrf: ben.csrf } })).status, 404);
  assert.equal((await s.request(`/loans/${loanId}/returned`, { method: "POST", cookie: ada.cookie, form: { csrf: ada.csrf } })).status, 303);
  assert.match((await s.request("/loans", { cookie: ben.cookie })).text, /You borrowed Ada Fictional, number 4's Pressure washer/);
  assert.ok(!(await s.request("/loans", { cookie: cleo.cookie })).text.includes("Pressure washer"));
});

test("names and tools are shown as text, never as markup", async (t) => {
  const s = await street(t);
  const ada = await s.join("ada@example.test", "<b>Ada</b>", "4");
  await s.request("/tools", { method: "POST", cookie: ada.cookie, form: { name: "<script>alert(1)</script>", csrf: ada.csrf } });
  const tools = await s.request("/tools", { cookie: ada.cookie });
  assert.ok(!tools.text.includes("<script>alert(1)</script>"));
  assert.ok(tools.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  const account = await s.request("/account", { cookie: ada.cookie });
  assert.ok(account.text.includes("&lt;b&gt;Ada&lt;/b&gt;"));
  assert.match(tools.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(tools.headers.get("referrer-policy"), "no-referrer");
});

test("the download holds everything about you, as a file", async (t) => {
  const s = await street(t);
  const ada = await s.join("ada@example.test", "Ada Fictional", "4");
  const ben = await s.join("ben@example.test", "Ben Fictional", "12");
  await s.request("/tools", { method: "POST", cookie: ada.cookie, form: { name: "Ladder", csrf: ada.csrf } });
  const toolId = /action="\/tools\/(\d+)\/ask"/.exec((await s.request("/tools", { cookie: ben.cookie })).text)[1];
  await s.request(`/tools/${toolId}/ask`, { method: "POST", cookie: ben.cookie, form: { csrf: ben.csrf } });

  const r = await s.request("/account/download", { cookie: ada.cookie });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-disposition"), 'attachment; filename="linden-tools-2026-10-03.json"');
  const data = JSON.parse(r.text);
  assert.deepEqual(data.you, { name: "Ada Fictional", email: "ada@example.test", houseNumber: "4", joinedAt: "2026-10-03T10:00:00.000Z" });
  assert.deepEqual(data.tools.map((x) => x.name), ["Ladder"]);
  assert.equal(data.loans.length, 1);
  assert.deepEqual(data.loans[0].otherPerson, { name: "Ben Fictional", houseNumber: "12" });
  assert.equal(data.sessions.length, 1);
  assert.ok(!r.text.includes("ben@example.test"));
});

test("deleting your account deletes everything about you, and signs you out", async (t) => {
  const s = await street(t);
  const ada = await s.join("ada@example.test", "Ada Fictional", "4");
  const ben = await s.join("ben@example.test", "Ben Fictional", "12");
  await s.request("/tools", { method: "POST", cookie: ada.cookie, form: { name: "Ladder", csrf: ada.csrf } });
  const toolId = /action="\/tools\/(\d+)\/ask"/.exec((await s.request("/tools", { cookie: ben.cookie })).text)[1];
  await s.request(`/tools/${toolId}/ask`, { method: "POST", cookie: ben.cookie, form: { csrf: ben.csrf } });

  const warning = await s.request("/account/delete", { cookie: ada.cookie });
  assert.match(warning.text, /Your Ladder: asked for by Ben Fictional, number 12/);
  const unconfirmed = await s.request("/account/delete", { method: "POST", cookie: ada.cookie, form: { csrf: ada.csrf } });
  assert.equal(unconfirmed.status, 400);
  assert.equal(s.store.counts().people, 2);

  const done = await s.request("/account/delete", { method: "POST", cookie: ada.cookie, form: { csrf: ada.csrf, confirm: "yes" } });
  assert.equal(done.status, 200);
  assert.match(done.headers.getSetCookie()[0], /Max-Age=0/);
  assert.deepEqual(s.store.counts(), { people: 1, tools: 0, loans: 0, signInLinks: 0, sessions: 1 });
  assert.equal((await s.request("/tools", { cookie: ada.cookie })).status, 303, "the old session is gone");
  assert.ok(!(await s.request("/loans", { cookie: ben.cookie })).text.includes("Ladder"));

  const before = s.sent.length;
  await s.request("/sign-in", { method: "POST", form: { email: "ada@example.test" } });
  assert.equal(s.sent.length, before, "a deleted address gets no sign-in link");
});

test("signing out ends the session", async (t) => {
  const s = await street(t);
  const ada = await s.join("ada@example.test", "Ada Fictional", "4");
  const out = await s.request("/sign-out", { method: "POST", cookie: ada.cookie, form: { csrf: ada.csrf } });
  assert.equal(out.status, 303);
  assert.equal((await s.request("/tools", { cookie: ada.cookie })).status, 303);
});

test("if an email can't be sent, the page still says the same, and the log names nobody", async (t) => {
  const s = await street(t, { failMail: true });
  s.store.createPerson({ name: "Ada Fictional", email: "ada@example.test", houseNumber: "4" }, new Date("2026-10-03T09:00:00Z"));
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args.join(" ")));
  const member = await s.request("/sign-in", { method: "POST", form: { email: "ada@example.test" } });
  const stranger = await s.request("/sign-in", { method: "POST", form: { email: "nobody@example.test" } });
  assert.equal(member.status, 200);
  assert.equal(member.text.replace("ada@example.test", "X"), stranger.text.replace("nobody@example.test", "X"));
  assert.equal(logged.length, 1);
  assert.match(logged[0], /HTTP 403/);
  assert.ok(!logged[0].includes("ada@example.test"));
});
