// Settings come from the environment (.env.example names them). No key, code or
// password lives in the code.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const baseUrl = String(env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");
  const streetCode = String(env.STREET_CODE || "");
  const resendApiKey = String(env.RESEND_API_KEY || "");
  const mailFrom = String(env.MAIL_FROM || "").trim();
  const databasePath = String(env.DATABASE_PATH || "var/linden-tools.db");
  // Real email is off unless the environment names a key.
  const mailMode = resendApiKey ? "resend" : "console";
  const problems = [];

  let host = "";
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("not http");
    host = url.hostname;
  } catch {
    problems.push("BASE_URL must be the address people reach Linden Tools at, starting with http:// or https://.");
  }
  const local = LOCAL_HOSTS.has(host);
  if (!Number.isInteger(port) || port < 0 || port > 65535) problems.push("PORT must be a port number.");
  if (streetCode.length < 8) problems.push("STREET_CODE must be set, to at least 8 characters: people need it to join.");

  if (mailMode === "resend") {
    if (!mailFrom) problems.push("MAIL_FROM must be set when RESEND_API_KEY is: the address sign-in emails come from. Resend sends to other people only from a domain verified with it.");
    if (host && !local && !baseUrl.startsWith("https://")) {
      problems.push("BASE_URL must start with https:// to send real sign-in emails: over plain http, anyone on the way could read a sign-in link or the session cookie.");
    }
  } else if (host && !local) {
    problems.push("RESEND_API_KEY isn't set, so sign-in emails would only be printed to the server's output, which runs only on this computer (a BASE_URL on localhost). To run Linden Tools for real, set RESEND_API_KEY and MAIL_FROM.");
  }

  return { port, baseUrl, streetCode, mailMode, resendApiKey, mailFrom, databasePath, secureCookies: baseUrl.startsWith("https://"), problems };
}
