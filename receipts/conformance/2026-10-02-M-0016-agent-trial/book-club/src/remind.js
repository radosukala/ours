// The monthly reminder: npm run remind
//
// Run it once a month, for example from cron, on the 1st at 9:00:
//   0 9 1 * *  cd /path/to/book-club && npm run remind
//
// It sends each member, through Resend, the next meeting and their private
// link, once per meeting (--force sends it again, --dry-run sends nothing).
// It also deletes answers to meetings more than 12 months past, as
// our.one.json says.
import { Resend } from "resend";
import * as store from "./data/store.js";
import { formatDate } from "./pages.js";

const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reminder(member, meeting) {
  const book = meeting.bookAuthor ? `${meeting.bookTitle} by ${meeting.bookAuthor}` : meeting.bookTitle;
  return [
    `Hi ${member.firstName},`,
    "",
    `The next book club meeting is on ${formatDate(meeting.date)} at ${meeting.time}, at ${meeting.place}.`,
    `We're reading ${book}.`,
    "",
    "Will you come? Answer on your private page:",
    `${SITE_URL}/m/${member.linkKey}`,
    "",
    "The same page lets you download your data or delete it.",
  ].join("\n");
}

async function main() {
  if (!dryRun) {
    const deleted = store.deleteOldAnswers();
    if (deleted > 0) console.log(`Deleted ${deleted} answer(s) to meetings more than ${store.ANSWERS_KEPT_MONTHS} months ago.`);
  }
  const meeting = store.nextMeeting();
  if (!meeting) {
    console.log("No meeting is planned, so no reminder was sent.");
    return 0;
  }
  if (meeting.remindedOn && !force) {
    console.log(`The reminder for ${meeting.date} went out on ${meeting.remindedOn}. Use --force to send it again.`);
    return 0;
  }
  const members = store.listMembers();
  if (dryRun) {
    console.log(`Would send the reminder for ${meeting.date} to ${members.length} member(s).`);
    return 0;
  }
  const { RESEND_API_KEY, REMINDER_FROM } = process.env;
  if (!RESEND_API_KEY || !REMINDER_FROM || !SITE_URL) {
    console.error("Set RESEND_API_KEY, REMINDER_FROM and SITE_URL first (see .env.example).");
    return 1;
  }
  const resend = new Resend(RESEND_API_KEY);
  let failed = 0;
  for (const member of members) {
    try {
      const { error } = await resend.emails.send({
        from: REMINDER_FROM,
        to: [member.email],
        subject: `Book club on ${formatDate(meeting.date)}: ${meeting.bookTitle}`,
        text: reminder(member, meeting),
      });
      if (error) throw new Error(error.message);
    } catch (error) {
      failed += 1;
      // The member's number only: email addresses stay out of the logs.
      console.error(`Couldn't send to member #${member.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await pause(600); // one email at a time: a club is about ten people
  }
  if (failed === 0) store.markReminded(meeting.id);
  const retry = failed > 0 ? " Run it again to retry; it sends to everyone again." : "";
  console.log(`Sent ${members.length - failed} of ${members.length} reminder(s) for ${meeting.date}.${retry}`);
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
