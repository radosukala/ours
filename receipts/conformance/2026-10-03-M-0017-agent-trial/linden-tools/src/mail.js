// Sending sign-in emails. Two mailers, with the same send():
//
// - resendMailer sends through Resend (our.one.json, data.sharedWith). It is
//   used only when the environment names a key, RESEND_API_KEY.
// - consoleMailer, for development, prints each email to the server's output
//   and sends nothing. It is used when there is no key, and only on localhost.
//
// Resend receives the recipient's address, the subject and the text, which
// holds the sign-in link. Nothing else goes to it.

const RESEND_API = "https://api.resend.com/emails";

export function resendMailer({ apiKey, from, fetchImpl = fetch, timeoutMs = 10_000 }) {
  return {
    async send({ to, subject, text }) {
      const res = await fetchImpl(RESEND_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // The error names only the status: never the address, the link or the key.
      if (!res.ok) throw new Error(`Resend didn't accept the email (HTTP ${res.status}).`);
    },
  };
}

export function consoleMailer(write = (text) => process.stdout.write(text)) {
  return {
    async send({ to, subject, text }) {
      write(`\n--- An email Linden Tools would send (development: not sent) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n--- end ---\n`);
    },
  };
}
