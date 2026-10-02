// The club page: a small web server with no framework.
//
//   GET  /                  a short note; everything else is behind a private link
//   GET  /m/<key>           the club page, for the member the link belongs to
//   POST /m/<key>/answer    "I'll come" or "I can't come", for the next meeting
//   GET  /m/<key>/export    the member's data, as a JSON file
//   GET  /m/<key>?delete    asks the member to confirm
//   POST /m/<key>/delete    deletes the member's data
//
// Requests aren't logged, so no IP address or private link is written anywhere.
import { createServer } from "node:http";
import * as store from "./data/store.js";
import { clubPage, deletedPage, homePage, notFoundPage } from "./pages.js";

const PORT = Number(process.env.PORT) || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

const HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer", // the private link never leaves in a Referer header
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...HEADERS, "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { ...HEADERS, Location: location });
  res.end();
}

async function readForm(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("The form is too large.");
  }
  return new URLSearchParams(body);
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const [first, key, action = "", ...rest] = url.pathname.split("/").filter(Boolean);
  if (!first && req.method === "GET") return send(res, 200, homePage());

  const member = first === "m" && rest.length === 0 ? store.findMemberByKey(key) : null;
  if (!member) return send(res, 404, notFoundPage());
  const base = `/m/${member.linkKey}`;

  if (req.method === "GET" && action === "") {
    const meeting = store.nextMeeting();
    return send(
      res,
      200,
      clubPage({
        member,
        members: store.listFirstNames(),
        meeting,
        coming: meeting ? store.comingTo(meeting.id) : [],
        isComing: meeting ? store.isComing(member.id, meeting.id) : false,
        base,
        askDelete: url.searchParams.has("delete"),
      }),
    );
  }
  if (req.method === "POST" && action === "answer") {
    const form = await readForm(req);
    const meeting = store.nextMeeting();
    if (meeting && form.get("meeting") === String(meeting.id)) store.setComing(member.id, meeting.id, form.get("coming") === "yes");
    return redirect(res, base);
  }
  if (req.method === "GET" && action === "export") {
    const data = store.exportMember(member.id, SITE_URL);
    return send(res, 200, `${JSON.stringify(data, null, 2)}\n`, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="book-club-my-data.json"',
    });
  }
  if (req.method === "POST" && action === "delete") {
    const form = await readForm(req);
    if (form.get("confirm") !== "yes") return redirect(res, base);
    store.deleteMember(member.id);
    return send(res, 200, deletedPage());
  }
  return send(res, 404, notFoundPage());
}

createServer((req, res) => {
  handle(req, res).catch((error) => {
    // The message only: the address holds a private link, so it isn't logged.
    console.error(`A request failed: ${error instanceof Error ? error.message : String(error)}`);
    if (res.headersSent) res.end();
    else send(res, 500, "Something went wrong.", { "Content-Type": "text/plain; charset=utf-8" });
  });
}).listen(PORT, () => {
  console.log(`The club page is on http://localhost:${PORT}`);
});
