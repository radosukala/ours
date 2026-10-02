// Starts Linden Tools: node src/server.js (npm start), or npm run dev with a .env file.
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { openStore } from "./data/store.js";
import { consoleMailer, resendMailer } from "./mail.js";

const HOUR = 60 * 60 * 1000;

const config = readConfig();
if (config.problems.length > 0) {
  for (const problem of config.problems) console.error(problem);
  process.exit(1);
}

const store = openStore(config.databasePath);
// Real sign-in emails go through Resend only when RESEND_API_KEY is set; otherwise they are printed.
const mailer = config.mailMode === "resend" ? resendMailer({ apiKey: config.resendApiKey, from: config.mailFrom }) : consoleMailer();
const app = createApp({ store, mailer, config });
console.log(config.mailMode === "resend" ? "Sign-in emails go through Resend." : "No RESEND_API_KEY: sign-in emails are printed here, not sent.");

// What has outlived its time in our.one.json (data.collects) is deleted at start, then every hour.
store.purge(new Date());
setInterval(() => store.purge(new Date()), HOUR).unref();

const server = createServer(app);
server.listen(config.port, () => console.log(`Linden Tools is running at ${config.baseUrl}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
