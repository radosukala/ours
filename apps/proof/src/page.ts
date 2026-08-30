import type { CompileResult, Finding } from "@ours/schemas";
import type { Records } from "./records.ts";

/**
 * The Authority Trace.
 *
 * The predecessor project's surface was a billboard: near-black, condensed
 * capitals at poster scale, a scarcity counter. It had to shout because it
 * had a claim and no evidence. This page has evidence, so it is quiet — the
 * register of an interface someone uses daily rather than a campaign poster,
 * because a record that shouts is less believable, not more.
 *
 * The one structural argument the design makes: articles no machine could
 * decide sit in the same list, at the same weight, as the ones that passed.
 * Every dashboard green-checks its passes and buries its gaps. The gap is the
 * honest part of the report, so it is not buried.
 */

const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MARKER: Record<Finding["outcome"], string> = {
  PASS: "●",
  NOT_MACHINE_DECIDABLE: "○",
  REFUSED: "✕",
};

const STATE_WORD: Record<Finding["outcome"], string> = {
  PASS: "held",
  NOT_MACHINE_DECIDABLE: "open",
  REFUSED: "refused",
};

const STYLES = `
:root {
  --ground: #ffffff;
  --surface: #f6f7f9;
  --ink: #14171a;
  --muted: #5f6b76;
  --faint: #8b95a0;
  --line: #e2e6ea;
  --accent: #1f5fa8;
  --critical: #a8331f;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #0e1013;
    --surface: #171a1e;
    --ink: #e7eaee;
    --muted: #9aa4af;
    --faint: #6d7883;
    --line: #262b31;
    --accent: #7aa9e0;
    --critical: #e08a7a;
  }
}
:root[data-theme="dark"] {
  --ground: #0e1013;
  --surface: #171a1e;
  --ink: #e7eaee;
  --muted: #9aa4af;
  --faint: #6d7883;
  --line: #262b31;
  --accent: #7aa9e0;
  --critical: #e08a7a;
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 2px;
}
.skip {
  position: absolute; left: -9999px;
  background: var(--ground); color: var(--ink);
  padding: 12px 16px; border: 1px solid var(--line); border-radius: 6px;
}
.skip:focus { left: 16px; top: 16px; z-index: 10; }

.wrap { max-width: 760px; margin: 0 auto; padding: 0 24px; }

header.top {
  border-bottom: 1px solid var(--line);
  padding: 20px 0;
  margin-bottom: 56px;
}
header.top .wrap {
  display: flex; flex-wrap: wrap; gap: 8px 20px;
  align-items: baseline; justify-content: space-between;
}
.word { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
.word span { color: var(--muted); font-weight: 400; margin-left: 10px; }
.top-status {
  font-family: var(--mono); font-size: 12px; color: var(--muted);
  letter-spacing: 0.02em;
}

h1 {
  font-size: 30px; line-height: 1.25; font-weight: 600;
  letter-spacing: -0.015em; margin: 0 0 20px; text-wrap: balance;
}
.lede { font-size: 17px; color: var(--muted); margin: 0 0 12px; max-width: 62ch; }
.lede strong { color: var(--ink); font-weight: 500; }

section { margin: 56px 0; }
h2 {
  font-family: var(--mono); font-size: 11px; font-weight: 500;
  letter-spacing: 0.09em; text-transform: uppercase; color: var(--faint);
  margin: 0 0 20px; padding-bottom: 10px; border-bottom: 1px solid var(--line);
}
h2 + p { margin-top: -4px; }
p { margin: 0 0 16px; max-width: 68ch; }
.note { color: var(--muted); font-size: 15px; }

/* The chain, as a record rather than a hero. */
dl.chain { margin: 0; display: grid; gap: 0; }
dl.chain > div {
  display: grid; grid-template-columns: 190px 1fr; gap: 4px 24px;
  padding: 13px 0; border-bottom: 1px solid var(--line); align-items: baseline;
}
dl.chain dt {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--faint);
}
dl.chain dd { margin: 0; font-size: 15px; }
dl.chain dd .id { font-family: var(--mono); font-size: 14px; }
dl.chain dd .sub { display: block; color: var(--muted); font-size: 14px; margin-top: 3px; }

/* One list. Held and open share every property but the marker. */
ul.checks { list-style: none; margin: 0; padding: 0; }
ul.checks > li {
  display: grid; grid-template-columns: 20px 1fr; gap: 4px 12px;
  padding: 15px 0; border-bottom: 1px solid var(--line);
}
.mark { font-size: 11px; line-height: 1.9; color: var(--muted); }
.mark[data-outcome="REFUSED"] { color: var(--critical); }
.head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.rule { font-family: var(--mono); font-size: 14px; color: var(--ink); }
.cls {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.07em;
  color: var(--faint); border: 1px solid var(--line);
  padding: 1px 6px; border-radius: 3px;
}
.why { grid-column: 2; margin: 0; color: var(--muted); font-size: 14.5px; max-width: 62ch; }

.tally {
  display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 20px 0 0;
  font-family: var(--mono); font-size: 12px; color: var(--muted);
}
.tally b { color: var(--ink); font-weight: 500; }

table.articles { width: 100%; border-collapse: collapse; font-size: 14.5px; }
table.articles th {
  text-align: left; font-family: var(--mono); font-size: 10.5px;
  letter-spacing: 0.07em; text-transform: uppercase; color: var(--faint);
  font-weight: 500; padding: 0 12px 10px 0; border-bottom: 1px solid var(--line);
}
table.articles td {
  padding: 11px 12px 11px 0; border-bottom: 1px solid var(--line);
  vertical-align: baseline;
}
table.articles td:first-child { font-family: var(--mono); font-size: 13.5px; white-space: nowrap; }
table.articles td:last-child { font-family: var(--mono); font-size: 11px; color: var(--faint); }
.scroll { overflow-x: auto; }

ul.plain { margin: 0; padding: 0 0 0 20px; color: var(--muted); }
ul.plain li { margin-bottom: 9px; max-width: 62ch; }
ul.plain li strong { color: var(--ink); font-weight: 500; }

pre {
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
  padding: 16px 18px; overflow-x: auto; margin: 0 0 16px;
  font-family: var(--mono); font-size: 13px; line-height: 1.7; color: var(--ink);
}
code { font-family: var(--mono); font-size: 0.92em; }

.callout {
  border-left: 2px solid var(--line); padding: 2px 0 2px 20px;
  margin: 0 0 16px; color: var(--muted);
}
.callout strong { color: var(--ink); font-weight: 500; }

footer.end {
  border-top: 1px solid var(--line); margin-top: 72px; padding: 28px 0 64px;
  color: var(--faint); font-size: 13.5px;
}
footer.end p { margin: 0 0 8px; }
footer.end .links { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 14px; font-family: var(--mono); font-size: 12px; }

@media (max-width: 640px) {
  h1 { font-size: 25px; }
  dl.chain > div { grid-template-columns: 1fr; gap: 2px; padding: 12px 0; }
  ul.checks > li { grid-template-columns: 16px 1fr; }
  .why { grid-column: 2; }
  section { margin: 44px 0; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

function chainRow(label: string, main: string, sub?: string): string {
  return `        <div>
          <dt>${esc(label)}</dt>
          <dd>${main}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</dd>
        </div>`;
}

function checkItem(f: Finding): string {
  return `        <li>
          <span class="mark" data-outcome="${f.outcome}" aria-hidden="true">${MARKER[f.outcome]}</span>
          <span class="head">
            <span class="rule">${esc(f.rule)}</span>
            <span class="cls">${esc(f.enforcement)}</span>
            <span class="visually-hidden"></span>
          </span>
          <p class="why"><b class="visually-hidden">${STATE_WORD[f.outcome]}: </b>${esc(f.message)}</p>
        </li>`;
}

export function renderPage(records: Records, result: CompileResult, builtAt: string): string {
  const { authority, decision, mandate, articles } = records;
  const held = result.findings.filter((f) => f.outcome === "PASS").length;
  const open = result.findings.filter((f) => f.outcome === "NOT_MACHINE_DECIDABLE").length;
  const refused = result.findings.filter((f) => f.outcome === "REFUSED").length;

  return `<!doctype html>
<html lang="en" data-theme-default>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Why is this page running? · OURS</title>
<meta name="description" content="The authority, mandate, and checks behind the page you are reading — including the articles no machine could decide.">
<meta name="color-scheme" content="light dark">
<style>${STYLES}
.visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to the trace</a>

<header class="top">
  <div class="wrap">
    <div class="word">OURS<span>the institution compiler</span></div>
    <div class="top-status">${esc(authority.actor.id.toUpperCase())} AUTHORITY · NO MEMBER INSTITUTION</div>
  </div>
</header>

<main id="main">
  <div class="wrap">

    <h1>Why is this page running?</h1>
    <p class="lede">Because a person with the authority to decide it said so, in a document
    you can read, which bounded what an agent was allowed to build. <strong>Every row below
    resolves to a record in a public repository.</strong> Nothing on this page was written by
    hand.</p>
    <p class="note">Most software cannot answer this question about itself. That is the only
    thing being demonstrated here — not that the answer is impressive, but that there is one.</p>

    <section aria-labelledby="chain-h">
      <h2 id="chain-h">The chain</h2>
      <dl class="chain">
${chainRow("Running artifact", `<span class="id">this page</span>`, `built ${builtAt}`)}
${chainRow(
  "Implementation mandate",
  `<span class="id">${esc(mandate.mandate_id)}</span> · ${esc(mandate.class)}`,
  mandate.title,
)}
${chainRow(
  "Authorised by",
  `<span class="id">${esc(decision.decision_id)}</span> · ${esc(decision.class)}`,
  decision.title,
)}
${chainRow(
  "Root source",
  `<span class="id">${esc(authority.authority_id)}</span>`,
  authority.title,
)}
${chainRow(
  "Decided by",
  esc(authority.actor.id),
  `a ${authority.actor.kind}, acting as ${authority.actor.role}`,
)}
${chainRow(
  "Built by",
  `<span class="id">claude-opus-5</span>`,
  "a replaceable agent, holding BUILD authority and no capability to publish",
)}
${chainRow(
  "Deploy authority",
  esc(mandate.release.production_allowed ? "granted" : "not held by this mandate"),
  "publishing requires a separate mandate, so the thing that builds cannot release itself",
)}
${chainRow("Authority expires", esc(mandate.authority.expires_at), "after which this mandate authorises nothing")}
      </dl>
    </section>

    <section aria-labelledby="checks-h">
      <h2 id="checks-h">What was checked — and what was not</h2>
      <p class="note">One list. The articles a machine could not decide are not moved to a
      footnote, greyed out, or dropped. They carry the same weight as the ones that held,
      because the gap between what is written and what was verified is the honest part of
      this report.</p>
      <ul class="checks">
${result.findings.map(checkItem).join("\n")}
      </ul>
      <p class="tally">
        <span><b>${held}</b> held</span>
        <span><b>${open}</b> open — no machine can decide them</span>
        <span><b>${refused}</b> refused</span>
      </p>
      <p class="note" style="margin-top:16px">There is deliberately no combined total. A single
      number would say the constitution was verified, when what was verified is the part of it
      a machine can decide.</p>
    </section>

    <section aria-labelledby="articles-h">
      <h2 id="articles-h">Every article, and how it is actually held</h2>
      <p class="note">The constitution requires that no article be untagged. <code>ENFORCED</code>
      means a check blocks the action. <code>INTERPRETED</code> means a named human decides.
      <code>DECLARED</code> means it is written down and nothing yet holds it.</p>
      <div class="scroll">
        <table class="articles">
          <thead><tr><th>Article</th><th>What it requires</th><th>Held as</th></tr></thead>
          <tbody>
${articles
  .map(
    (a) => `            <tr><td>${esc(a.id)}</td><td>${esc(a.title)}</td><td>${
      a.classes.length > 0 ? esc(a.classes.join(" · ")) : "UNTAGGED"
    }</td></tr>`,
  )
  .join("\n")}
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="untrue-h">
      <h2 id="untrue-h">What is not true yet</h2>
      <p class="note">Stated here rather than left for someone to discover.</p>
      <ul class="plain">
        <li><strong>There are no members.</strong> No membership has been issued, legally or
        otherwise. Nobody has ratified anything on this page.</li>
        <li><strong>No member institution exists.</strong> Authority here is one person's, and
        the page says so at the top rather than in a footnote.</li>
        <li><strong>Nothing here is beyond that person's reach.</strong> The weakest real
        enforcement layer is <code>${esc(authority.weakest_enforcement_layer)}</code> — every
        check above runs in a pipeline the founder can delete without notice. It is not
        tamper-resistant and is not described as such.</li>
        <li><strong>The scope envelope is advisory.</strong> The kernel validates what a
        mandate declares it may touch; it does not sandbox the agent that carries it out.</li>
        <li><strong>Nobody outside this project has reviewed it.</strong> The comprehension
        review has not run. If five readers cannot answer who authorised this and how to
        reverse it, that is recorded as a failed test rather than as feedback.</li>
      </ul>
    </section>

    <section aria-labelledby="verify-h">
      <h2 id="verify-h">Verify this without trusting us</h2>
      <p>The bundle embeds its own sources and their digests. The verifier re-derives every
      hash from those bytes and re-walks the chain. It needs no account, no network, and no
      copy of this repository — copy it to an empty directory and it still answers.</p>
      <pre>git clone https://github.com/radosukala/ours
cd ours &amp;&amp; pnpm install

pnpm ours check ${esc(mandate.mandate_id)}      # re-run every check above
pnpm ours export ${esc(mandate.mandate_id)}     # write a self-contained bundle
pnpm ours verify exit/bundle-${esc(mandate.mandate_id)}.json</pre>
      <p class="callout"><strong>Then break it.</strong> <code>pnpm test</code> runs the denial
      suite. Most of those tests are refusals, and each asserts the reason rather than merely
      the rejection — a test checking only that something failed would pass against a kernel
      that refused everything.</p>
    </section>

    <section aria-labelledby="reverse-h">
      <h2 id="reverse-h">How to reverse it</h2>
      <p>${esc(mandate.rollback.method)}</p>
      <p class="callout"><strong>What a reversal would not undo:</strong>
      ${esc(mandate.rollback.irreversible_residue)}</p>
      <p class="note">A change that declares "revert the commit" while dropping data is making
      a false statement in a document whose purpose is truthfulness. So a destructive mandate
      that claims to leave nothing behind is refused by the kernel, not caught in review.</p>
    </section>

  </div>
</main>

<footer class="end">
  <div class="wrap">
    <p>OURS · oursorg.com · the institution compiler</p>
    <p>Authority: ${esc(authority.actor.id)} bootstrap. Member institution: not formed.
    Member ownership: not issued. These labels change when the events occur, not when the
    outcome starts to feel inevitable.</p>
    <p class="links">
      <a href="https://github.com/radosukala/ours">Repository</a>
      <a href="https://github.com/radosukala/ours/blob/main/constitution/CONSTITUTION-0.1.md">Constitution</a>
      <a href="https://github.com/radosukala/ours/blob/main/decisions/${esc(decision.decision_id)}.md">${esc(decision.decision_id)}</a>
      <a href="https://github.com/radosukala/ours/blob/main/mandates/${esc(mandate.mandate_id)}.md">${esc(mandate.mandate_id)}</a>
      <a href="https://github.com/radosukala/ours/blob/main/authority/FOUNDING-AUTHORITY.md">Founding authority</a>
    </p>
  </div>
</footer>
</body>
</html>
`;
}
