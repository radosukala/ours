# FICTIONAL Book Club

A small private page for a book club of about ten friends: who is in the
club, which book is next, who is coming, and a reminder email of the next
meeting once a month.

FICTIONAL: this project, its people and its addresses are made up.

## What members see

Each member has a private link. It opens the club page: the next meeting
and its book, buttons to say whether they'll come, who is coming, and the
first names of everyone in the club. The same page lets them download their
data or delete it. The front page (`/`) shows nothing about anyone.

## Run it

It needs Node 22.9 or later.

```sh
npm install
cp .env.example .env          # then fill it in
npm run admin -- add Ada ada@example.test
npm run admin -- meeting 2026-11-05 19:00 "Cafe FICTIONAL" "A FICTIONAL Novel" "A. Writer"
npm run admin -- members      # prints each member's private link
npm start                     # the page, on http://localhost:3000
```

`npm run admin` with no command lists them all, including `remove` and
`export`.

## The monthly reminder

```sh
npm run remind -- --dry-run   # says what it would send, and sends nothing
npm run remind                # sends it
```

Run it once a month, for example from cron, on the 1st at 9:00:

```text
0 9 1 * *  cd /path/to/book-club && npm run remind
```

It sends each member the next meeting through Resend, with their private
link, once per meeting (`--force` sends it again). It also deletes answers
to meetings more than 12 months past.

## What it keeps about people

`our.one.json` lists it: each member's first name and email address, a
random key in their private link, and the meetings they said they'd come
to. Only a yes is kept, and not when it was given. Requests aren't logged.

The database is one SQLite file, `storage/book-club.db`, which git ignores.
All the code that touches it is in `src/data`.

Resend receives each member's first name, email address and private link,
with the meeting's details, to deliver the reminder. Hosting isn't chosen
yet: whoever hosts it will hold the database file, and will be named in
`our.one.json` before it runs there.

Write the meeting place as a public place, or as "at Ada's", not as a home
address: it goes into every reminder.

- **Download:** a member opens their private link and chooses *Download my
  data*. The organizer can also run `npm run admin -- export <id>`.
- **Delete:** a member opens their private link and chooses *Delete my
  data*. The organizer can also run `npm run admin -- remove <id>`. SQLite's
  `secure_delete` is on, so deleted rows are overwritten in the database
  file. The app makes no backups; if you add some, say in `our.one.json` how
  long deleted data stays in them.

## our.one

This project is being prepared to be proposed to our.one. It is FICTIONAL
Maintainer's project: our.one hasn't approved, listed or protected it. The
rules it follows are in `AGENTS.md`. Check it with
`node scripts/our-one.mjs check`.

## Maintainer and licence

FICTIONAL Maintainer, maintainer@example.test. MIT licence: see `LICENSE`.
