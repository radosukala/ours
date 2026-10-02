// Sending sign-in emails, and the settings that turn it on. Nothing is sent:
// the Resend mailer is given a fake fetch. Every address here is fictional.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/config.js";
import { resendMailer } from "../src/mail.js";

const STREET_CODE = "linden-row-test-code";
const KEY = "fictional-test-key";

test("real email is off unless the environment names a key", () => {
  const dev = readConfig({ STREET_CODE });
  assert.equal(dev.mailMode, "console");
  assert.deepEqual(dev.problems, []);
  const live = readConfig({ STREET_CODE, RESEND_API_KEY: KEY, MAIL_FROM: "Linden Tools <tools@example.test>", BASE_URL: "https://tools.example.test" });
  assert.equal(live.mailMode, "resend");
  assert.deepEqual(live.problems, []);
  assert.equal(live.secureCookies, true);
});

test("the settings refuse what would leak sign-in links", () => {
  // No key on a real address: links would only be printed to the server's log.
  assert.ok(readConfig({ STREET_CODE, BASE_URL: "https://tools.example.test" }).problems.some((p) => p.startsWith("RESEND_API_KEY isn't set")));
  // A key, but plain http on a real address: links and cookies would cross the network unencrypted.
  assert.ok(readConfig({ STREET_CODE, RESEND_API_KEY: KEY, MAIL_FROM: "tools@example.test", BASE_URL: "http://203.0.113.7" }).problems.some((p) => p.startsWith("BASE_URL must start with https://")));
  // A key, but no address to send from.
  assert.ok(readConfig({ STREET_CODE, RESEND_API_KEY: KEY, BASE_URL: "https://tools.example.test" }).problems.some((p) => p.startsWith("MAIL_FROM must be set")));
  assert.ok(readConfig({ STREET_CODE: "short" }).problems.some((p) => p.startsWith("STREET_CODE")));
});

test("the Resend mailer sends only the address, the subject and the text, with the key from the environment", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };
  const mailer = resendMailer({ apiKey: KEY, from: "Linden Tools <tools@example.test>", fetchImpl });
  const message = { to: "ada@example.test", subject: "Your sign-in link for Linden Tools", text: "Here is your link: http://localhost:3000/link?token=abc" };
  await mailer.send(message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: "Linden Tools <tools@example.test>", to: ["ada@example.test"], subject: message.subject, text: message.text });
});

test("when Resend refuses an email, the error names neither the address nor the key", async () => {
  const mailer = resendMailer({ apiKey: KEY, from: "tools@example.test", fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(mailer.send({ to: "ada@example.test", subject: "s", text: "t" }), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.ok(!error.message.includes("ada@example.test"));
    assert.ok(!error.message.includes(KEY));
    return true;
  });
});
