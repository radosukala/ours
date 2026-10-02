// The organizer's command line: npm run admin -- <command>
import * as store from "./data/store.js";
import { formatDate } from "./pages.js";

const SITE_URL = (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");

const USAGE = `npm run admin -- <command>

  members                     the members, with email address and private link
  add <first name> <email>    add a member
  remove <id>                 remove a member, deleting everything kept about them
  export <id>                 a member's data as JSON, for a member who asks for it
  meetings                    the meetings
  meeting <YYYY-MM-DD> <HH:MM> <place> <book title> [author]
                              plan a meeting; put quotes round anything with spaces`;

function main([command, ...args]) {
  switch (command) {
    case "members": {
      const members = store.listMembers();
      if (members.length === 0) console.log("No members yet.");
      for (const m of members) console.log(`#${m.id}  ${m.firstName}  <${m.email}>  ${SITE_URL}/m/${m.linkKey}`);
      return 0;
    }
    case "add": {
      if (args.length !== 2) break;
      const m = store.addMember(args[0], args[1]);
      console.log(`Added #${m.id} ${m.firstName}. Their private link: ${SITE_URL}/m/${m.linkKey}`);
      return 0;
    }
    case "remove": {
      if (args.length !== 1) break;
      const removed = store.deleteMember(Number(args[0]));
      console.log(removed ? `Removed member #${args[0]}, and deleted everything kept about them.` : `There is no member #${args[0]}.`);
      return removed ? 0 : 1;
    }
    case "export": {
      if (args.length !== 1) break;
      const data = store.exportMember(Number(args[0]), SITE_URL);
      if (!data) {
        console.error(`There is no member #${args[0]}.`);
        return 1;
      }
      console.log(JSON.stringify(data, null, 2));
      return 0;
    }
    case "meetings": {
      const meetings = store.listMeetings();
      if (meetings.length === 0) console.log("No meetings yet.");
      for (const m of meetings) {
        const author = m.bookAuthor ? `, ${m.bookAuthor}` : "";
        const reminded = m.remindedOn ? `  (reminder sent ${m.remindedOn})` : "";
        console.log(`#${m.id}  ${formatDate(m.date)} ${m.time}  ${m.place}  ${m.bookTitle}${author}${reminded}`);
      }
      return 0;
    }
    case "meeting": {
      if (args.length < 4 || args.length > 5) break;
      const [date, time, place, bookTitle, bookAuthor] = args;
      const id = store.addMeeting({ date, time, place, bookTitle, bookAuthor });
      console.log(`Planned meeting #${id} on ${formatDate(date)}.`);
      return 0;
    }
    case undefined:
    case "help":
      console.log(USAGE);
      return 0;
  }
  console.error(USAGE);
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
