// Every database call in this project is in this folder (our.one rule 1).
// The rest of the code calls these functions, so the database can be
// replaced without touching it.
//
// What is kept about people is listed in our.one.json, under data.collects:
// each member's first name, email address and private-link key, and the
// meetings they said they would come to. Nothing else, and no times.
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Answers to a meeting are kept until this many months after it. */
export const ANSWERS_KEPT_MONTHS = 12;

let db = null;

function open() {
  if (db) return db;
  const path = process.env.DATABASE_PATH || "storage/book-club.db";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("secure_delete = ON"); // deleted rows are overwritten in the file
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id         INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      link_key   TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id          INTEGER PRIMARY KEY,
      date        TEXT NOT NULL,          -- YYYY-MM-DD
      time        TEXT NOT NULL,          -- HH:MM
      place       TEXT NOT NULL,
      book_title  TEXT NOT NULL,
      book_author TEXT NOT NULL DEFAULT '',
      reminded_on TEXT                    -- YYYY-MM-DD the reminder went out
    );
    CREATE TABLE IF NOT EXISTS answers (
      member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      PRIMARY KEY (member_id, meeting_id)
    );
  `);
  return db;
}

const MEETING = "meetings.id AS id, date, time, place, book_title AS bookTitle, book_author AS bookAuthor, reminded_on AS remindedOn";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ members */

/** First names only: all that members see of each other. */
export function listFirstNames() {
  return open().prepare("SELECT id, first_name AS firstName FROM members ORDER BY first_name COLLATE NOCASE, id").all();
}

/** Everything about every member: for the organizer and the reminder. */
export function listMembers() {
  return open().prepare("SELECT id, first_name AS firstName, email, link_key AS linkKey FROM members ORDER BY id").all();
}

export function addMember(firstName, email) {
  const name = String(firstName ?? "").trim();
  const address = String(email ?? "").trim();
  if (!name || name.length > 40) throw new Error("A first name of 1 to 40 characters is needed.");
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error(`"${address}" isn't an email address.`);
  if (open().prepare("SELECT 1 FROM members WHERE email = ?").get(address)) throw new Error(`${address} is already a member.`);
  const linkKey = randomBytes(24).toString("base64url");
  const { lastInsertRowid } = open().prepare("INSERT INTO members (first_name, email, link_key) VALUES (?, ?, ?)").run(name, address, linkKey);
  return { id: Number(lastInsertRowid), firstName: name, email: address, linkKey };
}

/** The member a private link belongs to, or null. */
export function findMemberByKey(linkKey) {
  if (typeof linkKey !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(linkKey)) return null;
  return open().prepare("SELECT id, first_name AS firstName, link_key AS linkKey FROM members WHERE link_key = ?").get(linkKey) ?? null;
}

function findMember(id) {
  return open().prepare("SELECT id, first_name AS firstName, email, link_key AS linkKey FROM members WHERE id = ?").get(id) ?? null;
}

/** Deletes a member and everything kept about them. True if there was one. */
export function deleteMember(id) {
  const d = open();
  return d.transaction(() => {
    d.prepare("DELETE FROM answers WHERE member_id = ?").run(id);
    return d.prepare("DELETE FROM members WHERE id = ?").run(id).changes > 0;
  })();
}

/** Everything kept about one member, for them to download. Null if there is no such member. */
export function exportMember(id, siteUrl) {
  const member = findMember(id);
  if (!member) return null;
  const meetings = open()
    .prepare(`SELECT ${MEETING} FROM meetings JOIN answers ON answers.meeting_id = meetings.id WHERE answers.member_id = ? ORDER BY date, time`)
    .all(id);
  return {
    firstName: member.firstName,
    email: member.email,
    privateLink: `${siteUrl}/m/${member.linkKey}`,
    meetingsYouSaidYouWouldComeTo: meetings.map((m) => ({ date: m.date, time: m.time, place: m.place, book: m.bookTitle, author: m.bookAuthor })),
  };
}

/* ------------------------------------------------------------ meetings */

export function addMeeting({ date, time, place, bookTitle, bookAuthor = "" }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error("Write the date as YYYY-MM-DD.");
  if (!/^\d{2}:\d{2}$/.test(time ?? "")) throw new Error("Write the time as HH:MM.");
  if (!String(place ?? "").trim()) throw new Error("Say where the meeting is.");
  if (!String(bookTitle ?? "").trim()) throw new Error("Say which book.");
  const { lastInsertRowid } = open()
    .prepare("INSERT INTO meetings (date, time, place, book_title, book_author) VALUES (?, ?, ?, ?, ?)")
    .run(date, time, String(place).trim(), String(bookTitle).trim(), String(bookAuthor ?? "").trim());
  return Number(lastInsertRowid);
}

export function listMeetings() {
  return open().prepare(`SELECT ${MEETING} FROM meetings ORDER BY date, time`).all();
}

/** The next meeting, from today on, or null. */
export function nextMeeting() {
  return open().prepare(`SELECT ${MEETING} FROM meetings WHERE date >= ? ORDER BY date, time LIMIT 1`).get(today()) ?? null;
}

export function markReminded(meetingId) {
  open().prepare("UPDATE meetings SET reminded_on = ? WHERE id = ?").run(today(), meetingId);
}

/* ------------------------------------------------------------ answers */

/** First names of the members who said they would come. */
export function comingTo(meetingId) {
  return open()
    .prepare("SELECT members.id AS id, first_name AS firstName FROM answers JOIN members ON members.id = answers.member_id WHERE meeting_id = ? ORDER BY first_name COLLATE NOCASE")
    .all(meetingId);
}

export function isComing(memberId, meetingId) {
  return Boolean(open().prepare("SELECT 1 FROM answers WHERE member_id = ? AND meeting_id = ?").get(memberId, meetingId));
}

/** Only a yes is kept: saying no deletes the answer. */
export function setComing(memberId, meetingId, coming) {
  const sql = coming
    ? "INSERT OR IGNORE INTO answers (member_id, meeting_id) VALUES (?, ?)"
    : "DELETE FROM answers WHERE member_id = ? AND meeting_id = ?";
  open().prepare(sql).run(memberId, meetingId);
}

/** Deletes answers to meetings more than ANSWERS_KEPT_MONTHS months past. Returns how many. */
export function deleteOldAnswers() {
  return open()
    .prepare("DELETE FROM answers WHERE meeting_id IN (SELECT id FROM meetings WHERE date < date('now', ?))")
    .run(`-${ANSWERS_KEPT_MONTHS} months`).changes;
}
