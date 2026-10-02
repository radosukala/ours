// What each page says. Plain HTML forms, no scripts: every page works without JavaScript.
import { day, html, layout } from "./html.js";

const csrfField = (csrf) => html`<input type="hidden" name="csrf" value="${csrf}">`;
const who = (name, houseNumber) => html`${name}, number ${houseNumber}`;

export function startPage({ signInError, joinError, values = {} } = {}) {
  return layout({
    title: "Welcome",
    body: html`<h1>Linden Tools</h1>
<p>Neighbours on Linden Row list the tools they're happy to lend, such as a drill, a ladder or a pressure washer, and borrow each other's for a few days.</p>
<section aria-labelledby="sign-in">
<h2 id="sign-in">Sign in</h2>
${signInError ? html`<p class="error" role="alert">${signInError}</p>` : ""}
<form method="post" action="/sign-in">
<label for="sign-in-email">Your email address</label>
<input id="sign-in-email" name="email" type="email" autocomplete="email" required value="${values.signInEmail ?? ""}">
<button>Send me a sign-in link</button>
</form>
</section>
<section aria-labelledby="join">
<h2 id="join">Join</h2>
<p>For the households on Linden Row. Ask a neighbour for the street code.</p>
${joinError ? html`<p class="error" role="alert">${joinError}</p>` : ""}
<form method="post" action="/join">
<label for="join-email">Your email address</label>
<input id="join-email" name="email" type="email" autocomplete="email" required value="${values.joinEmail ?? ""}">
<label for="join-code">The street code</label>
<input id="join-code" name="code" type="text" autocomplete="off" required>
<button>Send me a link to join</button>
</form>
</section>
<p class="muted">Linden Tools keeps your name, email address and house number, the tools you list, and your loans. Neighbours see names, house numbers and tools, never email addresses. You can download all of it, or delete it, from your account.</p>`,
  });
}

export function checkEmailPage({ email }) {
  return layout({
    title: "Check your email",
    body: html`<h1>Check your email</h1>
<p>If ${email} can sign in or join, a link is on its way to it. The link works once, within 15 minutes.</p>
<p>Nothing there after a few minutes? Check the spam folder, or <a href="/">ask again</a> in a minute.</p>`,
  });
}

export function linkPage({ purpose, token, error, values = {} }) {
  if (purpose === "join") {
    return layout({
      title: "Join",
      body: html`<h1>Join Linden Tools</h1>
<p>Neighbours who have joined will see your name and house number, and the tools you list. They won't see your email address.</p>
${error ? html`<p class="error" role="alert">${error}</p>` : ""}
<form method="post" action="/link">
<input type="hidden" name="token" value="${token}">
<label for="name">Your name</label>
<input id="name" name="name" type="text" maxlength="60" autocomplete="name" required value="${values.name ?? ""}">
<label for="house">Your house number, just the number</label>
<input id="house" name="houseNumber" type="text" maxlength="5" inputmode="numeric" required value="${values.houseNumber ?? ""}">
<button>Join</button>
</form>`,
    });
  }
  return layout({
    title: "Sign in",
    body: html`<h1>Sign in to Linden Tools</h1>
<form method="post" action="/link">
<input type="hidden" name="token" value="${token}">
<button>Sign in</button>
</form>`,
  });
}

export function linkExpiredPage() {
  return layout({
    title: "Link expired",
    body: html`<h1>This link doesn't work any more</h1>
<p>Each link works once, within 15 minutes. <a href="/">Ask for a new one</a>.</p>`,
  });
}

export function toolsPage({ person, csrf, neighbours, error, values = {}, notice }) {
  const me = neighbours.find((n) => n.id === person.id) ?? { tools: [] };
  const others = neighbours.filter((n) => n.id !== person.id);
  const withTools = others.filter((n) => n.tools.length > 0);
  const without = others.filter((n) => n.tools.length === 0);
  return layout({
    title: "Tools",
    person,
    body: html`<h1>Tools</h1>
${notice ? html`<p class="notice" role="status">${notice}</p>` : ""}
<section aria-labelledby="yours">
<h2 id="yours">Your tools</h2>
${me.tools.length === 0
  ? html`<p class="muted">You haven't listed a tool yet.</p>`
  : html`<ul class="plain">${me.tools.map(
      (t) => html`<li><span>${t.name}</span><form class="inline" method="post" action="/tools/${t.id}/remove">${csrfField(csrf)}<button class="quiet">Remove</button></form></li>`,
    )}</ul>`}
${error ? html`<p class="error" role="alert">${error}</p>` : ""}
<form method="post" action="/tools">
${csrfField(csrf)}
<label for="tool-name">A tool you're happy to lend</label>
<input id="tool-name" name="name" type="text" maxlength="80" required value="${values.name ?? ""}">
<button>List it</button>
</form>
</section>
<h2>Your neighbours' tools</h2>
<p class="muted">Everyone who has joined sees names, house numbers and tools. Nobody sees anyone else's email address.</p>
${withTools.length === 0 ? html`<p>No neighbour has listed a tool yet.</p>` : ""}
${withTools.map(
  (n) => html`<section>
<h3>${who(n.name, n.houseNumber)}</h3>
<ul class="plain">${n.tools.map(
    (t) => html`<li><span>${t.name}</span><form class="inline" method="post" action="/tools/${t.id}/ask">${csrfField(csrf)}<button>Ask to borrow</button></form></li>`,
  )}</ul>
</section>`,
)}
${without.length > 0 ? html`<p class="muted">Also joined, with no tools listed yet: ${without.map((n, i) => html`${i > 0 ? "; " : ""}${who(n.name, n.houseNumber)}`)}.</p>` : ""}`,
  });
}

function loanLine(loan, csrf) {
  const other = who(loan.otherName, loan.otherHouseNumber);
  const button = (action, label, quiet = false) =>
    html`<form class="inline" method="post" action="/loans/${loan.id}/${action}">${csrfField(csrf)}<button${quiet ? html` class="quiet"` : ""}>${label}</button></form>`;
  if (loan.role === "lender" && loan.status === "asked") {
    return html`<li><span>${other} asks to borrow your ${loan.tool} (asked ${day(loan.askedAt)})</span><span>${button("lend", "Lend it")} ${button("decline", "Decline", true)}</span></li>`;
  }
  if (loan.role === "lender" && loan.status === "lent") {
    return html`<li><span>Your ${loan.tool} is with ${other} (since ${day(loan.lentAt)})</span>${button("returned", "It's back")}</li>`;
  }
  if (loan.role === "borrower" && loan.status === "asked") {
    return html`<li><span>You asked ${other} for their ${loan.tool} (${day(loan.askedAt)})</span>${button("withdraw", "Withdraw", true)}</li>`;
  }
  if (loan.role === "borrower" && loan.status === "lent") {
    return html`<li><span>You have ${other}'s ${loan.tool} (since ${day(loan.lentAt)}). They mark it returned when it's back.</span></li>`;
  }
  const lender = loan.role === "lender";
  const text = {
    returned: lender ? html`Your ${loan.tool} was with ${other}, ${day(loan.lentAt)} to ${day(loan.returnedAt)}` : html`You borrowed ${other}'s ${loan.tool}, ${day(loan.lentAt)} to ${day(loan.returnedAt)}`,
    declined: lender ? html`You declined ${other}'s request for your ${loan.tool} (${day(loan.closedAt)})` : html`${other} declined your request for their ${loan.tool} (${day(loan.closedAt)})`,
    withdrawn: lender ? html`${other} withdrew their request for your ${loan.tool} (${day(loan.closedAt)})` : html`You withdrew your request for ${other}'s ${loan.tool} (${day(loan.closedAt)})`,
  }[loan.status];
  return html`<li><span>${text}</span></li>`;
}

export function loansPage({ person, csrf, loans, notice }) {
  const group = (title, list, empty) => html`<section>
<h2>${title}</h2>
${list.length === 0 ? html`<p class="muted">${empty}</p>` : html`<ul class="plain">${list.map((l) => loanLine(l, csrf))}</ul>`}
</section>`;
  const is = (role, status) => (l) => l.role === role && status.includes(l.status);
  return layout({
    title: "Loans",
    person,
    body: html`<h1>Loans</h1>
${notice ? html`<p class="notice" role="status">${notice}</p>` : ""}
<p class="muted">In Linden Tools, only the lender and the borrower see a loan, though whoever runs the server could read it in the database. Linden Tools sends no email about requests: look here when you sign in. A loan is kept for a year after it ends.</p>
${group("Asked of you", loans.filter(is("lender", ["asked"])), "Nobody is waiting for an answer from you.")}
${group("Lent out", loans.filter(is("lender", ["lent"])), "None of your tools is out.")}
${group("You asked", loans.filter(is("borrower", ["asked"])), "You're not waiting for an answer.")}
${group("You're borrowing", loans.filter(is("borrower", ["lent"])), "You have nobody's tool.")}
${group("Past loans", loans.filter((l) => ["returned", "declined", "withdrawn"].includes(l.status)), "None yet.")}`,
  });
}

export function accountPage({ person, csrf }) {
  return layout({
    title: "Your account",
    person,
    body: html`<h1>Your account</h1>
<section>
<h2>You</h2>
<p>${who(person.name, person.houseNumber)}<br>${person.email} <span class="muted">(neighbours don't see it)</span><br><span class="muted">Joined ${day(person.joinedAt)}</span></p>
</section>
<section>
<h2>What Linden Tools keeps about you</h2>
<ul>
<li>Your name, email address and house number, until you delete your account.</li>
<li>The tools you list, until you remove them or delete your account.</li>
<li>Your loans: who asked for which tool, from whom, and when it was lent and returned. Only the lender and the borrower see a loan, and it is kept for a year after it ends.</li>
<li>Your sign-in links, for up to 15 minutes, and your sessions, for 30 days or until you sign out.</li>
</ul>
<p class="muted">The database is a file on a server rented from Hetzner, in Germany. Whoever runs that server could read everything in it, loans included. Besides Hetzner, only Resend, which sends the sign-in emails, receives anything about you: your email address and your sign-in link. There are no ads and no analytics.</p>
</section>
<section>
<h2>Download your data</h2>
<p><a href="/account/download">Download everything about you</a>, as one file (JSON).</p>
</section>
<section>
<h2>Delete your account</h2>
<p><a href="/account/delete">Delete your account</a>, and everything about you with it.</p>
</section>
<form method="post" action="/sign-out">${csrfField(csrf)}<button class="quiet">Sign out</button></form>`,
  });
}

export function deletePage({ person, csrf, openLoans, error }) {
  return layout({
    title: "Delete your account",
    person,
    body: html`<h1>Delete your account</h1>
<p>This deletes, at once: your account, your name, email address and house number, the tools you listed, every loan you were part of, and your sign-in links and sessions. The other person's record of a loan with you goes too. It can't be undone.</p>
${openLoans.length > 0
  ? html`<div class="warning"><p>These are still open. Sort them out with your neighbour first: once you delete your account, the record is gone for both of you.</p><ul>${openLoans.map((l) =>
      l.role === "lender"
        ? html`<li>Your ${l.tool}: ${l.status === "lent" ? "lent to" : "asked for by"} ${who(l.otherName, l.otherHouseNumber)}</li>`
        : html`<li>${l.tool} from ${who(l.otherName, l.otherHouseNumber)}: ${l.status === "lent" ? "you have it" : "you asked for it"}</li>`,
    )}</ul></div>`
  : ""}
<p>Want a copy first? <a href="/account/download">Download everything about you</a>.</p>
${error ? html`<p class="error" role="alert">${error}</p>` : ""}
<form method="post" action="/account/delete">
${csrfField(csrf)}
<label class="check"><input type="checkbox" name="confirm" value="yes" required> Yes, delete my account and everything about me.</label>
<button>Delete my account</button>
</form>`,
  });
}

export function deletedPage() {
  return layout({
    title: "Deleted",
    body: html`<h1>Your account is deleted</h1>
<p>Linden Tools no longer keeps anything about you. You can <a href="/">join again</a> at any time.</p>`,
  });
}

export function messagePage({ person = null, title, message }) {
  return layout({
    title,
    person,
    body: html`<h1>${title}</h1>
<p>${message}</p>
<p><a href="${person ? "/tools" : "/"}">Back</a></p>`,
  });
}
