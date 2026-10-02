# AGENTS.md

Instructions for any coding agent working on this project.

## This project

Linden Tools, a tool-lending library for the households on Linden Row. Node 22.13 or later, and no npm dependencies.

- `src/data/` is the boundary: the only code that touches the database (`node:sqlite`). Everything else calls the functions `openStore` returns.
- `src/app.js` answers requests; `src/pages.js` and `src/html.js` write the pages, escaping every value; `src/mail.js` sends sign-in emails through Resend when the environment holds `RESEND_API_KEY`, and otherwise only prints them, on localhost. The account page names Hetzner and Resend: keep it, and `our.one.json`, in step with any change of service.
- `npm test` runs the tests, `npm run check` the our.one check. Test the denial paths, not only the happy one.
- Before code keeps a new kind of personal data, or sends anything to a new service, add it to `our.one.json`, and keep the download and the deletion covering it.

<!-- our.one rules 0: begin. The check compares this block with its own copy, so change nothing between the markers. -->
## our.one rules (version 0)

This project is being built to be proposed to our.one. These rules come from the common agreement (https://our.one/agreement), which is still a draft. They bind every person and every coding agent working on this code. If a task would break one, stop and say which.

1. **Keep personal data inside the boundary.** Only code in the folders `our.one.json` names in `data.boundary` may use a database or a file store, or the libraries that reach one.
2. **Declare before you collect.** Before code keeps a new kind of personal data, add it to `data.collects`: what it is, why the service needs it, and how long it is kept.
3. **Name every service that receives data.** Before code sends anything about a person to an outside service, add the service to `data.sharedWith`: who, what and why.
4. **No ads and no tracking.** No ad networks or pixels, no Google Analytics or Tag Manager, no session recording, no data brokers or data hubs.
5. **Nothing is sold.** Build nothing that sells, rents or trades people's data, or the project.
6. **People can leave.** Keep export and deletion working for everything in `data.collects`.
7. **Costs are public.** Keep the costs file `our.one.json` names up to date.
8. **No secrets in the code.** Keys and passwords live in the environment, never in a file the repository tracks.
9. **Say only what is true.** Until our.one's records say otherwise, the project is its maintainer's. Don't present it as its users' property, or as approved, listed or protected by our.one.
10. **Run the check before you finish:** `node scripts/our-one.mjs check`. Fix every FAIL. Never change the check, or this block, to make it pass.
<!-- our.one rules 0: end -->
