// Writing pages. Every value put into a page is escaped, unless it is markup
// this file made (html`…`), so a name or a tool's name can't add markup.

class Markup {
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function render(value) {
  if (value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(render).join("");
  if (value instanceof Markup) return value.text;
  return escapeHtml(value);
}

/** A template tag: html`<p>${name}</p>` escapes name. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += render(values[i]) + strings[i + 1];
  return new Markup(out);
}

/** A date as people read it, such as "3 October 2026". */
export function day(isoText) {
  return new Date(isoText).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The page around every page's content. */
export function layout({ title, person, body }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Linden Tools</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header>
<a class="home" href="/">Linden Tools</a>
${person ? html`<nav aria-label="Linden Tools"><a href="/tools">Tools</a> <a href="/loans">Loans</a> <a href="/account">Your account</a></nav>` : ""}
</header>
<main>
${body}
</main>
<footer><p>Lending and borrowing tools on Linden Row. No payments, no ads, no analytics.</p></footer>
</body>
</html>
`;
}

export const STYLE = `:root {
  color-scheme: light dark;
  --ink: #1d2520;
  --muted: #5b665f;
  --paper: #f7f5ef;
  --card: #ffffff;
  --line: #d9d5c9;
  --accent: #2f6b48;
  --warn: #8a4b0f;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #e8ebe6; --muted: #a9b3ab; --paper: #151a17; --card: #1d241f; --line: #34403a; --accent: #7cc39a; --warn: #e3a35f; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
header, main, footer { max-width: 42rem; margin: 0 auto; padding: 0 1rem; }
header { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; align-items: baseline; padding-top: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--line); }
header .home { font-weight: 700; font-size: 1.15rem; color: var(--ink); text-decoration: none; }
nav a { margin-right: 1rem; }
a { color: var(--accent); }
h1 { font-size: 1.6rem; margin: 1.5rem 0 0.5rem; }
h2 { font-size: 1.2rem; margin: 1.75rem 0 0.5rem; }
section, .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 0.25rem 1rem 1rem; margin: 1rem 0; }
ul.plain { list-style: none; padding: 0; margin: 0; }
ul.plain li { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-top: 1px solid var(--line); }
ul.plain li:first-child { border-top: 0; }
form.inline { display: inline; }
label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
label.check { font-weight: 400; display: flex; gap: 0.5rem; align-items: flex-start; }
input[type=text], input[type=email] { width: 100%; max-width: 24rem; font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); }
button { font: inherit; padding: 0.4rem 0.9rem; margin-top: 0.75rem; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--paper); cursor: pointer; }
form.inline button, li button { margin-top: 0; }
button.quiet { background: transparent; color: var(--accent); }
.muted { color: var(--muted); }
.notice { border-left: 4px solid var(--accent); padding: 0.5rem 0.75rem; background: var(--card); }
.error, .warning { border-left: 4px solid var(--warn); padding: 0.5rem 0.75rem; background: var(--card); }
footer { margin-top: 3rem; padding-bottom: 2rem; color: var(--muted); font-size: 0.9rem; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
`;
