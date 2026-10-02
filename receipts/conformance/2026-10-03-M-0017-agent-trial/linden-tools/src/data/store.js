// The boundary (our.one.json, data.boundary): every database call in Linden Tools
// is in this folder. The rest of the code calls the functions openStore returns,
// never the database, so the store can be replaced without touching the rest.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DAY = 24 * 60 * 60 * 1000;

/** A loan is kept for a year after it ends (our.one.json, data.collects). */
export const LOANS_KEPT_DAYS = 365;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  house_number TEXT NOT NULL,
  joined_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  listed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tools_owner ON tools(owner_id);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY,
  tool_id INTEGER REFERENCES tools(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  lender_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  borrower_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('asked', 'lent', 'returned', 'declined', 'withdrawn')),
  asked_at TEXT NOT NULL,
  lent_at TEXT,
  returned_at TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS loans_lender ON loans(lender_id);
CREATE INDEX IF NOT EXISTS loans_borrower ON loans(borrower_id);
CREATE INDEX IF NOT EXISTS loans_tool ON loans(tool_id);
CREATE TABLE IF NOT EXISTS sign_in_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign-in', 'join')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sign_in_links_email ON sign_in_links(email);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_person ON sessions(person_id);
`;

const iso = (date) => date.toISOString();
const later = (date, ms) => new Date(date.getTime() + ms);
const lower = (email) => String(email).toLowerCase();

/** Opens (or creates) the database at `path`, or an in-memory one for ":memory:". */
export function openStore(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const conn = new DatabaseSync(path);
  conn.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") conn.exec("PRAGMA journal_mode = WAL");
  conn.exec(SCHEMA);

  const prepared = new Map();
  const statement = (text) => {
    let s = prepared.get(text);
    if (!s) {
      s = conn.prepare(text);
      prepared.set(text, s);
    }
    return s;
  };
  const one = (text, ...params) => {
    const row = statement(text).get(...params);
    return row ? { ...row } : null;
  };
  const all = (text, ...params) => statement(text).all(...params).map((row) => ({ ...row }));
  const run = (text, ...params) => statement(text).run(...params);
  const transaction = (fn) => {
    conn.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      conn.exec("COMMIT");
      return result;
    } catch (error) {
      conn.exec("ROLLBACK");
      throw error;
    }
  };

  // People ---------------------------------------------------------------

  const PERSON = "SELECT id, name, email, house_number AS houseNumber, joined_at AS joinedAt FROM people";

  function findPersonByEmail(email) {
    return one(`${PERSON} WHERE email = ?`, lower(email));
  }

  function getPerson(id) {
    return one(`${PERSON} WHERE id = ?`, id);
  }

  function createPerson({ name, email, houseNumber }, now) {
    const r = run("INSERT INTO people (name, email, house_number, joined_at) VALUES (?, ?, ?, ?)", name, lower(email), houseNumber, iso(now));
    return getPerson(Number(r.lastInsertRowid));
  }

  /** Everyone who has joined, with their tools: names, house numbers and tools only, never email addresses. */
  function listNeighbours() {
    const rows = all(
      `SELECT p.id, p.name, p.house_number AS houseNumber, t.id AS toolId, t.name AS toolName
       FROM people p LEFT JOIN tools t ON t.owner_id = p.id
       ORDER BY CAST(p.house_number AS INTEGER), p.house_number, p.name, p.id, t.name COLLATE NOCASE, t.id`,
    );
    const neighbours = [];
    const byId = new Map();
    for (const r of rows) {
      let n = byId.get(r.id);
      if (!n) {
        n = { id: r.id, name: r.name, houseNumber: r.houseNumber, tools: [] };
        byId.set(r.id, n);
        neighbours.push(n);
      }
      if (r.toolId !== null) n.tools.push({ id: r.toolId, name: r.toolName });
    }
    return neighbours;
  }

  // Tools ----------------------------------------------------------------

  function addTool(ownerId, name, now) {
    const r = run("INSERT INTO tools (owner_id, name, listed_at) VALUES (?, ?, ?)", ownerId, name, iso(now));
    return { id: Number(r.lastInsertRowid), name };
  }

  /** Removes the owner's tool. Refused while it is lent out; open requests for it are declined. */
  function removeTool(ownerId, toolId, now) {
    return transaction(() => {
      if (!one("SELECT id FROM tools WHERE id = ? AND owner_id = ?", toolId, ownerId)) return "not-found";
      if (one("SELECT id FROM loans WHERE tool_id = ? AND status = 'lent'", toolId)) return "lent-out";
      run("UPDATE loans SET status = 'declined', closed_at = ? WHERE tool_id = ? AND status = 'asked'", iso(now), toolId);
      run("DELETE FROM tools WHERE id = ?", toolId);
      return "removed";
    });
  }

  // Loans: each one is seen only by its lender and its borrower ------------

  function askToBorrow(borrowerId, toolId, now) {
    return transaction(() => {
      const tool = one("SELECT id, owner_id AS ownerId, name FROM tools WHERE id = ?", toolId);
      if (!tool) return "not-found";
      if (tool.ownerId === borrowerId) return "own-tool";
      if (one("SELECT id FROM loans WHERE tool_id = ? AND borrower_id = ? AND status IN ('asked', 'lent')", toolId, borrowerId)) return "already-asked";
      run("INSERT INTO loans (tool_id, tool_name, lender_id, borrower_id, status, asked_at) VALUES (?, ?, ?, ?, 'asked', ?)", tool.id, tool.name, tool.ownerId, borrowerId, iso(now));
      return "asked";
    });
  }

  /** The loans this person is part of, as lender or borrower, newest first. Nobody else's. */
  function loansFor(personId) {
    return all(
      `SELECT l.id, l.tool_name AS tool, l.status, l.asked_at AS askedAt, l.lent_at AS lentAt,
              l.returned_at AS returnedAt, l.closed_at AS closedAt,
              CASE WHEN l.lender_id = ? THEN 'lender' ELSE 'borrower' END AS role,
              o.name AS otherName, o.house_number AS otherHouseNumber
       FROM loans l
       JOIN people o ON o.id = CASE WHEN l.lender_id = ? THEN l.borrower_id ELSE l.lender_id END
       WHERE l.lender_id = ? OR l.borrower_id = ?
       ORDER BY l.asked_at DESC, l.id DESC`,
      personId,
      personId,
      personId,
      personId,
    );
  }

  /** Moves a loan from one state to the next, if `actorId` is its lender (or borrower) and it is in `from`. */
  function changeLoan(loanId, actorId, role, from, to, now) {
    return transaction(() => {
      const loan = role === "lender"
        ? one("SELECT id, tool_id AS toolId, status FROM loans WHERE id = ? AND lender_id = ?", loanId, actorId)
        : one("SELECT id, tool_id AS toolId, status FROM loans WHERE id = ? AND borrower_id = ?", loanId, actorId);
      if (!loan) return "not-found";
      if (loan.status !== from) return `not-${from}`;
      const at = iso(now);
      if (to === "lent") {
        if (loan.toolId === null) return "not-found";
        if (one("SELECT id FROM loans WHERE tool_id = ? AND status = 'lent' AND id <> ?", loan.toolId, loanId)) return "tool-out";
        run("UPDATE loans SET status = 'lent', lent_at = ? WHERE id = ?", at, loanId);
      } else if (to === "returned") {
        run("UPDATE loans SET status = 'returned', returned_at = ?, closed_at = ? WHERE id = ?", at, at, loanId);
      } else {
        run("UPDATE loans SET status = ?, closed_at = ? WHERE id = ?", to, at, loanId);
      }
      return to;
    });
  }

  const lend = (lenderId, loanId, now) => changeLoan(loanId, lenderId, "lender", "asked", "lent", now);
  const decline = (lenderId, loanId, now) => changeLoan(loanId, lenderId, "lender", "asked", "declined", now);
  const withdraw = (borrowerId, loanId, now) => changeLoan(loanId, borrowerId, "borrower", "asked", "withdrawn", now);
  const markReturned = (lenderId, loanId, now) => changeLoan(loanId, lenderId, "lender", "lent", "returned", now);

  // Sign-in links and sessions: only hashes of their codes are stored --------

  function saveSignInLink({ tokenHash, email, purpose }, now, lifetimeMs) {
    run("INSERT INTO sign_in_links (token_hash, email, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", tokenHash, lower(email), purpose, iso(now), iso(later(now, lifetimeMs)));
  }

  function lastSignInLinkAt(email) {
    const row = one("SELECT MAX(created_at) AS at FROM sign_in_links WHERE email = ?", lower(email));
    return row && row.at ? new Date(row.at) : null;
  }

  function peekSignInLink(tokenHash, now) {
    return one("SELECT email, purpose FROM sign_in_links WHERE token_hash = ? AND expires_at > ?", tokenHash, iso(now));
  }

  /** Uses a link: it works once. Every other link sent to the same address goes too. */
  function takeSignInLink(tokenHash, now) {
    return transaction(() => {
      const link = peekSignInLink(tokenHash, now);
      run("DELETE FROM sign_in_links WHERE token_hash = ?", tokenHash);
      if (link) run("DELETE FROM sign_in_links WHERE email = ?", link.email);
      return link;
    });
  }

  function createSession({ tokenHash, personId, csrf }, now, lifetimeMs) {
    run("INSERT INTO sessions (token_hash, person_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", tokenHash, personId, csrf, iso(now), iso(later(now, lifetimeMs)));
  }

  function sessionFor(tokenHash, now) {
    const row = one(
      `SELECT s.csrf, p.id, p.name, p.email, p.house_number AS houseNumber, p.joined_at AS joinedAt
       FROM sessions s JOIN people p ON p.id = s.person_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      tokenHash,
      iso(now),
    );
    if (!row) return null;
    const { csrf, ...person } = row;
    return { csrf, person };
  }

  function endSession(tokenHash) {
    run("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
  }

  // Leaving: download and deletion cover everything in data.collects ---------

  /** Everything Linden Tools keeps about this person, for the download. */
  function exportPerson(personId, now) {
    const person = getPerson(personId);
    if (!person) return null;
    return {
      service: "Linden Tools",
      exportedAt: iso(now),
      you: { name: person.name, email: person.email, houseNumber: person.houseNumber, joinedAt: person.joinedAt },
      tools: all("SELECT name, listed_at AS listedAt FROM tools WHERE owner_id = ? ORDER BY listed_at, id", personId),
      loans: loansFor(personId).map(({ id, otherName, otherHouseNumber, ...loan }) => ({ ...loan, otherPerson: { name: otherName, houseNumber: otherHouseNumber } })),
      sessions: all("SELECT created_at AS signedInAt, expires_at AS endsAt FROM sessions WHERE person_id = ? ORDER BY created_at", personId),
      signInLinks: all("SELECT purpose, created_at AS createdAt, expires_at AS expiresAt FROM sign_in_links WHERE email = ? ORDER BY created_at", person.email),
    };
  }

  /** Deletes the person and everything about them, at once: tools, loans, sessions and sign-in links. */
  function deletePerson(personId) {
    return transaction(() => {
      const person = getPerson(personId);
      if (!person) return false;
      run("DELETE FROM sign_in_links WHERE email = ?", person.email);
      // Their tools, every loan they were part of, and their sessions go with them (ON DELETE CASCADE).
      run("DELETE FROM people WHERE id = ?", personId);
      return true;
    });
  }

  /** Deletes what has outlived the time data.collects gives it. */
  function purge(now) {
    const cutoff = iso(new Date(now.getTime() - LOANS_KEPT_DAYS * DAY));
    return transaction(() => ({
      signInLinks: Number(run("DELETE FROM sign_in_links WHERE expires_at <= ?", iso(now)).changes),
      sessions: Number(run("DELETE FROM sessions WHERE expires_at <= ?", iso(now)).changes),
      loans: Number(
        run(
          "DELETE FROM loans WHERE (status IN ('returned', 'declined', 'withdrawn') AND closed_at <= ?) OR (status = 'asked' AND asked_at <= ?)",
          cutoff,
          cutoff,
        ).changes,
      ),
    }));
  }

  /** How many rows each table holds: for tests, and for checking that a deletion left nothing. */
  function counts() {
    const n = (table) => Number(one(`SELECT COUNT(*) AS n FROM ${table}`).n);
    return { people: n("people"), tools: n("tools"), loans: n("loans"), signInLinks: n("sign_in_links"), sessions: n("sessions") };
  }

  return {
    findPersonByEmail,
    getPerson,
    createPerson,
    listNeighbours,
    addTool,
    removeTool,
    askToBorrow,
    loansFor,
    lend,
    decline,
    withdraw,
    markReturned,
    saveSignInLink,
    lastSignInLinkAt,
    peekSignInLink,
    takeSignInLink,
    createSession,
    sessionFor,
    endSession,
    exportPerson,
    deletePerson,
    purge,
    counts,
    close: () => conn.close(),
  };
}
