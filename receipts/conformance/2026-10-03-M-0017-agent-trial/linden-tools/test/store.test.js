// The data rules, tested against the store itself. Every person here is fictional.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "../src/data/store.js";

const T0 = new Date("2026-10-03T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days) => new Date(T0.getTime() + days * DAY);

function street() {
  const store = openStore(":memory:");
  const ada = store.createPerson({ name: "Ada Fictional", email: "ada@example.test", houseNumber: "4" }, T0);
  const ben = store.createPerson({ name: "Ben Fictional", email: "ben@example.test", houseNumber: "12a" }, T0);
  const cleo = store.createPerson({ name: "Cleo Fictional", email: "cleo@example.test", houseNumber: "27" }, T0);
  return { store, ada, ben, cleo };
}

test("neighbours see names, house numbers and tools, never email addresses", () => {
  const { store, ada } = street();
  store.addTool(ada.id, "Drill", T0);
  const list = store.listNeighbours();
  assert.equal(list.length, 3);
  assert.deepEqual(list.find((n) => n.id === ada.id).tools.map((t) => t.name), ["Drill"]);
  assert.ok(!JSON.stringify(list).includes("@"));
});

test("a loan is seen only by its lender and its borrower", () => {
  const { store, ada, ben, cleo } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  assert.equal(store.askToBorrow(ben.id, drill.id, T0), "asked");
  assert.equal(store.loansFor(ada.id).length, 1);
  assert.equal(store.loansFor(ada.id)[0].role, "lender");
  assert.equal(store.loansFor(ben.id)[0].role, "borrower");
  assert.deepEqual(store.loansFor(cleo.id), []);
});

test("only the lender lends, declines or marks returned; only the borrower withdraws", () => {
  const { store, ada, ben, cleo } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  store.askToBorrow(ben.id, drill.id, T0);
  const loanId = store.loansFor(ben.id)[0].id;
  assert.equal(store.lend(cleo.id, loanId, T0), "not-found");
  assert.equal(store.lend(ben.id, loanId, T0), "not-found");
  assert.equal(store.decline(cleo.id, loanId, T0), "not-found");
  assert.equal(store.withdraw(ada.id, loanId, T0), "not-found");
  assert.equal(store.withdraw(cleo.id, loanId, T0), "not-found");
  assert.equal(store.lend(ada.id, loanId, at(1)), "lent");
  assert.equal(store.markReturned(ben.id, loanId, at(2)), "not-found");
  assert.equal(store.withdraw(ben.id, loanId, at(2)), "not-asked");
  assert.equal(store.markReturned(ada.id, loanId, at(3)), "returned");
  assert.equal(store.markReturned(ada.id, loanId, at(3)), "not-lent");
  const loan = store.loansFor(ben.id)[0];
  assert.equal(loan.status, "returned");
  assert.equal(loan.lentAt, at(1).toISOString());
  assert.equal(loan.returnedAt, at(3).toISOString());
});

test("a tool is lent to one neighbour at a time, and nobody borrows their own", () => {
  const { store, ada, ben, cleo } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  assert.equal(store.askToBorrow(ada.id, drill.id, T0), "own-tool");
  assert.equal(store.askToBorrow(ben.id, drill.id, T0), "asked");
  assert.equal(store.askToBorrow(ben.id, drill.id, T0), "already-asked");
  assert.equal(store.askToBorrow(cleo.id, drill.id, T0), "asked");
  assert.equal(store.askToBorrow(ben.id, 999, T0), "not-found");
  const [benLoan] = store.loansFor(ben.id);
  const [cleoLoan] = store.loansFor(cleo.id);
  assert.equal(store.lend(ada.id, benLoan.id, T0), "lent");
  assert.equal(store.lend(ada.id, cleoLoan.id, T0), "tool-out");
});

test("a lent-out tool can't be removed; removing a tool declines the requests for it", () => {
  const { store, ada, ben, cleo } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  store.askToBorrow(ben.id, drill.id, T0);
  store.askToBorrow(cleo.id, drill.id, T0);
  assert.equal(store.removeTool(ben.id, drill.id, T0), "not-found");
  assert.equal(store.lend(ada.id, store.loansFor(ben.id)[0].id, T0), "lent");
  assert.equal(store.removeTool(ada.id, drill.id, T0), "lent-out");
  assert.equal(store.markReturned(ada.id, store.loansFor(ben.id)[0].id, at(2)), "returned");
  assert.equal(store.removeTool(ada.id, drill.id, at(3)), "removed");
  assert.equal(store.loansFor(cleo.id)[0].status, "declined");
  assert.equal(store.loansFor(ben.id)[0].tool, "Drill"); // the record keeps what was borrowed
  assert.deepEqual(store.listNeighbours().find((n) => n.id === ada.id).tools, []);
});

test("the download holds everything about the person, and no one else's email address", () => {
  const { store, ada, ben } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  store.addTool(ben.id, "Ladder", T0);
  store.askToBorrow(ben.id, drill.id, T0);
  store.createSession({ tokenHash: "session-hash-for-ben", personId: ben.id, csrf: "form-code-for-ben" }, T0, DAY);
  store.saveSignInLink({ tokenHash: "link-hash-for-ben", email: "ben@example.test", purpose: "sign-in" }, T0, 15 * 60 * 1000);
  const data = store.exportPerson(ben.id, T0);
  assert.deepEqual(data.you, { name: "Ben Fictional", email: "ben@example.test", houseNumber: "12a", joinedAt: T0.toISOString() });
  assert.deepEqual(data.tools.map((t) => t.name), ["Ladder"]);
  assert.equal(data.loans.length, 1);
  assert.equal(data.loans[0].role, "borrower");
  assert.equal(data.loans[0].tool, "Drill");
  assert.deepEqual(data.loans[0].otherPerson, { name: "Ada Fictional", houseNumber: "4" });
  assert.equal(data.sessions.length, 1);
  assert.equal(data.signInLinks.length, 1);
  const text = JSON.stringify(data);
  assert.ok(!text.includes("ada@example.test"));
  // The codes themselves stay out: anyone holding the file could sign in with them.
  assert.ok(!text.includes("session-hash-for-ben") && !text.includes("form-code-for-ben") && !text.includes("link-hash-for-ben"));
});

test("deleting a person deletes everything about them, and every loan they were part of", () => {
  const { store, ada, ben, cleo } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  const ladder = store.addTool(ben.id, "Ladder", T0);
  store.askToBorrow(ben.id, drill.id, T0);
  store.askToBorrow(ada.id, ladder.id, T0);
  store.askToBorrow(cleo.id, ladder.id, T0);
  store.createSession({ tokenHash: "s-ben", personId: ben.id, csrf: "c" }, T0, DAY);
  store.saveSignInLink({ tokenHash: "l-ben", email: "ben@example.test", purpose: "sign-in" }, T0, 60 * 1000);
  assert.equal(store.deletePerson(ben.id), true);
  assert.equal(store.getPerson(ben.id), null);
  assert.equal(store.findPersonByEmail("ben@example.test"), null);
  assert.equal(store.sessionFor("s-ben", T0), null);
  assert.equal(store.peekSignInLink("l-ben", T0), null);
  assert.deepEqual(store.loansFor(ada.id), []);
  assert.deepEqual(store.loansFor(cleo.id), []);
  assert.ok(!JSON.stringify(store.listNeighbours()).includes("Ben"));
  assert.deepEqual(store.counts(), { people: 2, tools: 1, loans: 0, signInLinks: 0, sessions: 0 });
  assert.equal(store.deletePerson(ben.id), false);
});

test("a loan goes a year after it ends; a tool still out stays on record", () => {
  const { store, ada, ben, cleo } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  const saw = store.addTool(ada.id, "Saw", T0);
  store.askToBorrow(ben.id, drill.id, T0);
  store.askToBorrow(cleo.id, saw.id, T0);
  const benLoan = store.loansFor(ben.id)[0].id;
  const cleoLoan = store.loansFor(cleo.id)[0].id;
  store.lend(ada.id, benLoan, at(1));
  store.markReturned(ada.id, benLoan, at(3));
  store.lend(ada.id, cleoLoan, at(1)); // still out
  assert.equal(store.purge(at(367)).loans, 0); // returned on day 3: kept until day 368
  assert.equal(store.purge(at(368)).loans, 1);
  assert.deepEqual(store.loansFor(ben.id), []);
  assert.equal(store.loansFor(cleo.id).length, 1);
  assert.equal(store.purge(at(800)).loans, 0);
});

test("a request nobody answers goes a year after it was made", () => {
  const { store, ada, ben } = street();
  const drill = store.addTool(ada.id, "Drill", T0);
  store.askToBorrow(ben.id, drill.id, T0);
  assert.equal(store.purge(at(364)).loans, 0);
  assert.equal(store.purge(at(365)).loans, 1);
});

test("sign-in links work once and expire, and sessions end", () => {
  const store = openStore(":memory:");
  const minutes = (n) => new Date(T0.getTime() + n * 60 * 1000);
  store.saveSignInLink({ tokenHash: "a", email: "Dee@Example.test", purpose: "join" }, T0, 15 * 60 * 1000);
  store.saveSignInLink({ tokenHash: "b", email: "dee@example.test", purpose: "join" }, T0, 15 * 60 * 1000);
  assert.deepEqual(store.peekSignInLink("a", T0), { email: "dee@example.test", purpose: "join" });
  assert.equal(store.peekSignInLink("a", minutes(15)), null);
  assert.deepEqual(store.takeSignInLink("a", minutes(1)), { email: "dee@example.test", purpose: "join" });
  assert.equal(store.takeSignInLink("a", minutes(1)), null);
  assert.equal(store.peekSignInLink("b", minutes(1)), null); // using one link retires the others sent to that address
  const dee = store.createPerson({ name: "Dee Fictional", email: "dee@example.test", houseNumber: "8" }, T0);
  store.createSession({ tokenHash: "s", personId: dee.id, csrf: "c" }, T0, DAY);
  assert.equal(store.sessionFor("s", at(0.5)).person.name, "Dee Fictional");
  assert.equal(store.sessionFor("s", at(1)), null);
  assert.deepEqual(store.purge(at(1)), { signInLinks: 0, sessions: 1, loans: 0 });
});
