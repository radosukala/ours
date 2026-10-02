// The HTML pages: plain strings, no framework, and nothing loaded from
// another site (no fonts, scripts, images or counters).

const CLUB = "FICTIONAL Book Club";
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** "Thursday, 5 November 2026", from "2026-11-05". */
export function formatDate(isoDate) {
  const format = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return format.format(new Date(`${isoDate}T00:00:00Z`));
}

const FOOTER = `<footer>
  Maintained by FICTIONAL Maintainer, <a href="mailto:maintainer@example.test">maintainer@example.test</a>.
  <a href="https://example.test/fictional/book-club">Source code</a>, under the MIT licence.
</footer>`;

function layout(body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${CLUB}</title>
<style>
  body { font: 17px/1.5 system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; color: #222; background: #fdfcf9; }
  h1 { font-size: 1.6rem; margin-bottom: 0.2rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .muted, footer { color: #666; }
  footer { margin-top: 3rem; font-size: 0.9rem; }
  button { font: inherit; padding: 0.4rem 0.9rem; margin: 0 0.4rem 0.4rem 0; cursor: pointer; }
</style>
</head>
<body>
<h1>${CLUB}</h1>
${body}
${FOOTER}
</body>
</html>
`;
}

/** The front page shows nothing about anyone. */
export function homePage() {
  return layout(`
<p>This is the page of a small, private book club.</p>
<p>Members: open the private link in your reminder email to see the next book, who is coming, and who is in the club.</p>`);
}

/** The club page, at a member's private link. */
export function clubPage({ member, members, meeting, coming, isComing, base, askDelete }) {
  const names = (list) => list.map((m) => esc(m.firstName)).join(", ");
  const next = meeting
    ? `<p><strong>${esc(formatDate(meeting.date))}</strong> at ${esc(meeting.time)}, ${esc(meeting.place)}.</p>
<p>We're reading <em>${esc(meeting.bookTitle)}</em>${meeting.bookAuthor ? ` by ${esc(meeting.bookAuthor)}` : ""}.</p>
<form method="post" action="${esc(base)}/answer">
  <input type="hidden" name="meeting" value="${esc(meeting.id)}">
  <p>${isComing ? "You said you'll come." : "Will you come?"}</p>
  <button name="coming" value="yes">I'll come</button>
  <button name="coming" value="no">I can't come</button>
</form>
<p class="muted">Coming: ${coming.length > 0 ? names(coming) : "nobody has said yet"}.</p>`
    : `<p>No meeting is planned yet.</p>`;
  const yourData = askDelete
    ? `<form method="post" action="${esc(base)}/delete">
  <p><strong>Delete your data?</strong> Your first name, email address, private link and answers are deleted at once, and you get no more reminders. It can't be undone.</p>
  <button name="confirm" value="yes">Yes, delete my data</button>
  <a href="${esc(base)}">No, keep it</a>
</form>`
    : `<p><a href="${esc(base)}/export">Download my data</a> · <a href="${esc(base)}?delete">Delete my data</a></p>`;
  return layout(`
<p>Hello, ${esc(member.firstName)}.</p>
<h2>Next meeting</h2>
${next}
<h2>Who is in the club</h2>
<ul>
${members.map((m) => `  <li>${esc(m.firstName)}</li>`).join("\n")}
</ul>
<h2>Your data</h2>
<p class="muted">The club keeps your first name, your email address (only for the reminder; other members don't see it), this private link, and the meetings you said you'd come to. Keep the link to yourself: it opens this page without a password.</p>
${yourData}`);
}

export function deletedPage() {
  return layout(`
<p>Your data is deleted: your first name, email address, private link and answers. You'll get no more reminders.</p>
<p>To come back, ask the organizer to add you again.</p>`);
}

export function notFoundPage() {
  return layout(`
<p>This link doesn't open anything. It may be mistyped, or its member may have left the club.</p>`);
}
