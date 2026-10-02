#!/usr/bin/env node
/**
 * our-one.mjs: the our.one build kit's tool. Version 0.2.0, rules 0.
 *
 *   node scripts/our-one.mjs init     set this project up for our.one
 *   node scripts/our-one.mjs check    check it against the rules
 *   node scripts/our-one.mjs rules    print the rules block
 *
 * One file, no dependencies, Node 18 or later. It reads the project's
 * files, and runs git to list them and, during init, to read the remote's
 * address. It makes no network request. init writes only the files it
 * names, never through a link, and overwrites none of them, except the
 * rules block in AGENTS.md, which it puts back word for word, and the stop
 * hook it adds to .claude/settings.json. When it finds a secret, it prints
 * the file, the line and the kind of secret, never the secret.
 *
 * What it checks is decided by our.one's records (D-0019 §C), not by this
 * file: a change to the rules is a new rules version, by a new decision.
 * Each check says how it is held. Most are CHECKED: patterns that a
 * determined person can get around, and that can't see what code does when
 * it runs. So every run also lists what a person must read, and the
 * safeguards our.one hasn't built.
 *
 * Passing makes a project ready to propose to our.one. Nothing more: it is
 * not listed, approved or protected by passing.
 *
 * Source: https://github.com/radosukala/ours/tree/main/kit
 * Licence: Apache-2.0
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, fstatSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "0.2.0";
export const RULES_VERSION = "0";
export const MANIFEST = "our.one.json";
export const SCHEMA_URL = "https://our.one/kit/our.one.schema.json";
const DEFAULT_TOOL_PATH = "scripts/our-one.mjs";

/* ------------------------------------------------------------ the rules */

const BEGIN = `<!-- our.one rules ${RULES_VERSION}: begin. The check compares this block with its own copy, so change nothing between the markers. -->`;
const END = `<!-- our.one rules ${RULES_VERSION}: end -->`;

/**
 * The rules block, word for word (D-0019 §C). `init` writes it into
 * AGENTS.md; `check` compares it.
 */
export const RULES_BLOCK = [
  BEGIN,
  `## our.one rules (version ${RULES_VERSION})`,
  "",
  "This project is being built to be proposed to our.one. These rules come from the common agreement (https://our.one/agreement), which is still a draft. Three of them go further than its words, and wait for the founder's approval: rule 1, and no session recording and no data hubs in rule 4. They bind every person and every coding agent working on this code. If a task would break one, stop and say which.",
  "",
  "1. **Keep personal data inside the boundary.** Only code in the folders `our.one.json` names in `data.boundary` may use a database or a file store, or the libraries that reach one.",
  "2. **Declare before you collect.** Before code keeps a new kind of personal data, add it to `data.collects`: what it is, why the service needs it, and how long it is kept.",
  "3. **Name every service that receives data.** Before code sends anything about a person to an outside service, add the service to `data.sharedWith`: who, what and why.",
  "4. **No ads and no tracking.** No ad networks or pixels, no Google Analytics or Tag Manager, no session recording, no data brokers or data hubs.",
  "5. **Nothing is sold.** Build nothing that sells, rents or trades people's data, or the project.",
  "6. **People can leave.** Keep export and deletion working for everything in `data.collects`.",
  "7. **Costs are public.** Keep the costs file `our.one.json` names up to date.",
  "8. **No secrets or data in the repository.** Keys and passwords live in the environment, and people's data in the store, never in a file the repository tracks.",
  "9. **Say only what is true.** Until our.one's records say otherwise, the project is its maintainer's. Don't present it as its users' property, or as approved, listed or protected by our.one.",
  "10. **Run the check before you finish:** `node scripts/our-one.mjs check`. Fix every FAIL. Ask the person for anything only they know, and never invent it. Never change the check, or this block, to make it pass.",
  END,
].join("\n");

/** What a person reads when a project is proposed (D-0019 §C). No machine can decide these. */
export const FOR_A_PERSON = [
  "Is everything the code keeps about people in data.collects, and is it used only for the service?",
  "Do export and deletion work, for everything in data.collects?",
  "Is nothing sold, and does no money come from anyone who expects a return?",
  "Does PITCH.md say what the agreement asks: the need, what people would change, the price, the scope and the budget with the maintainer's pay, what it asks for now, and what must happen first?",
];

/** D-0018 §A's safeguards that our.one, not the project, would provide. None is built. */
export const NOT_BUILT = [
  "No keys: whoever runs a service never holds the database or the production secrets.",
  "Reach: at runtime, a service reads and writes only what it has declared.",
  "Leave: at runtime, data goes only to the services it has named.",
  "The record: every read of a person's data is logged where they can see it.",
  "Custody: the holder owns the accounts, the database and the backups.",
];

/* ------------------------------------------------------ what it knows */

/**
 * Clients of a database or a file store. Rule 1: only code inside the
 * boundary imports them. An entry ending in "/" is a whole scope; any
 * other entry also matches its subpaths ("pg" matches "pg/lib", not
 * "pg-promise"). Built-in clients are named with their prefix
 * ("node:sqlite").
 */
export const STORES = [
  "pg", "pg-promise", "postgres", "@neondatabase/serverless", "@vercel/postgres", "@planetscale/database",
  "mysql", "mysql2", "mariadb", "sqlite3", "better-sqlite3", "sqlite", "@libsql/client", "libsql",
  "node:sqlite", "bun:sqlite", "tedious", "mssql", "oracledb", "knex", "kysely", "drizzle-orm",
  "@prisma/client", "typeorm", "sequelize", "@mikro-orm/", "objection", "mongodb", "mongoose", "redis",
  "@redis/client", "ioredis", "redis-om", "@upstash/redis", "@vercel/kv", "firebase/firestore",
  "firebase/database", "firebase/storage", "firebase/compat/firestore", "firebase/compat/database",
  "firebase/compat/storage", "firebase-admin", "@google-cloud/firestore", "@google-cloud/storage",
  "@google-cloud/bigquery", "@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb", "dynamoose",
  "@aws-sdk/client-s3", "@aws-sdk/lib-storage", "@azure/storage-blob", "@azure/cosmos", "@vercel/blob",
  "cassandra-driver", "neo4j-driver", "couchbase", "nano", "pouchdb", "nedb", "lowdb", "@supabase/",
  "pocketbase", "@instantdb/", "faunadb", "fauna", "@electric-sql/", "convex/browser", "convex/server",
  "@pinecone-database/pinecone", "appwrite", "node-appwrite", "@xata.io/client", "surrealdb",
  "@surrealdb/", "duckdb", "@duckdb/", "arangojs",
];

/** Code that reaches a store without importing it by name: a generated Prisma client. */
const STORE_CALLS = [{ name: "PrismaClient", re: /\bnew\s+PrismaClient\s*\(/g }];

/**
 * Queries written outside the boundary against a client made inside it
 * and handed out, the commonest way round rule 1.
 */
const STORE_QUERIES = [
  { name: "a Prisma query", re: /\bprisma\s*\.\s*\$?[A-Za-z_]\w*\s*\.\s*(?:findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\s*\(/g },
  { name: "a raw Prisma query", re: /\bprisma\s*\.\s*\$(?:queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|transaction)\b/g },
  { name: "a database query", re: /\b(?:db|tx)\s*\.\s*(?:select|insert|update|delete|execute|transaction|query)\s*[.(<]/g },
  { name: "a database query", re: /\bpool\s*\.\s*query\s*\(/g },
  { name: "a Supabase query", re: /\bsupabase\s*\.\s*(?:from|rpc|storage)\b/g },
  { name: "a SQL query", re: /\bsql\s*`\s*(?:select|insert|update|delete|with)\b/gi },
];

/** Writing files is using a file store (rule 1). Counted only in files that import fs. */
const FS_MODULES = ["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra", "graceful-fs"];
const FS_WRITES = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|outputFileSync|outputFile|outputJsonSync|outputJson|writeJsonSync|writeJson)\s*\(/g;

/**
 * Outside services that receive data. Rule 3: each one the project uses is
 * named in data.sharedWith, by an entry whose "who" names it and whose
 * "packages" list the packages that reach it. A service is found by its
 * packages, or by an address of its API in the code. A generic entry is
 * named by any entry that lists the package.
 */
export const SERVICES = [
  { name: "Resend", packages: ["resend"], hosts: ["api.resend.com"] },
  { name: "SendGrid", packages: ["@sendgrid/"], hosts: ["api.sendgrid.com"] },
  { name: "Postmark", packages: ["postmark"], hosts: ["api.postmarkapp.com"] },
  { name: "Mailgun", packages: ["mailgun.js", "mailgun-js"], hosts: ["api.mailgun.net", "api.eu.mailgun.net"] },
  { name: "Mailchimp", packages: ["@mailchimp/"], hosts: ["api.mailchimp.com", "mandrillapp.com"] },
  { name: "Amazon SES", who: /amazon|aws|\bses\b/i, packages: ["@aws-sdk/client-ses", "@aws-sdk/client-sesv2"] },
  { name: "an email server (SMTP)", generic: true, packages: ["nodemailer"] },
  { name: "Twilio", packages: ["twilio"], hosts: ["api.twilio.com"] },
  { name: "Vonage", packages: ["@vonage/"], hosts: ["api.nexmo.com", "rest.nexmo.com"] },
  { name: "Slack", packages: ["@slack/"], hosts: ["hooks.slack.com"] },
  { name: "Telegram", packages: ["node-telegram-bot-api", "telegraf", "grammy"], hosts: ["api.telegram.org"] },
  { name: "Stripe", packages: ["stripe", "@stripe/"], hosts: ["api.stripe.com"] },
  { name: "Paddle", packages: ["@paddle/"], hosts: ["api.paddle.com"] },
  { name: "Lemon Squeezy", who: /lemon/i, packages: ["@lemonsqueezy/"], hosts: ["api.lemonsqueezy.com"] },
  { name: "PayPal", packages: ["@paypal/"], hosts: ["api-m.paypal.com", "api.paypal.com"] },
  { name: "OpenAI", packages: ["openai", "@ai-sdk/openai", "@langchain/openai"], hosts: ["api.openai.com"] },
  { name: "Anthropic", packages: ["@anthropic-ai/sdk", "@ai-sdk/anthropic", "@langchain/anthropic"], hosts: ["api.anthropic.com"] },
  { name: "Google AI", who: /google|gemini/i, packages: ["@google/generative-ai", "@google/genai", "@ai-sdk/google", "@ai-sdk/google-vertex", "@google-cloud/vertexai", "@langchain/google-genai"], hosts: ["generativelanguage.googleapis.com", "aiplatform.googleapis.com"] },
  { name: "Mistral", packages: ["@mistralai/mistralai", "@ai-sdk/mistral"], hosts: ["api.mistral.ai"] },
  { name: "Cohere", packages: ["cohere-ai", "@ai-sdk/cohere"], hosts: ["api.cohere.ai", "api.cohere.com"] },
  { name: "Groq", packages: ["groq-sdk", "@ai-sdk/groq"], hosts: ["api.groq.com"] },
  { name: "xAI", who: /\bxai\b|grok/i, packages: ["@ai-sdk/xai"], hosts: ["api.x.ai"] },
  { name: "Amazon Bedrock", who: /amazon|aws|bedrock/i, packages: ["@aws-sdk/client-bedrock-runtime", "@aws-sdk/client-bedrock", "@ai-sdk/amazon-bedrock"] },
  { name: "OpenRouter", packages: ["@openrouter/"], hosts: ["openrouter.ai"] },
  { name: "fal.ai", who: /\bfal\b/i, packages: ["@fal-ai/"], hosts: ["fal.run"] },
  { name: "Replicate", packages: ["replicate"], hosts: ["api.replicate.com"] },
  { name: "Hugging Face", who: /hugging/i, packages: ["@huggingface/inference"], hosts: ["api-inference.huggingface.co", "router.huggingface.co"] },
  { name: "ElevenLabs", packages: ["elevenlabs", "@elevenlabs/"], hosts: ["api.elevenlabs.io"] },
  { name: "an AI provider, through the AI SDK", generic: true, packages: ["@ai-sdk/"] },
  { name: "an AI provider, through the AI SDK's gateway", generic: true, packages: [], gateway: true },
  { name: "Sentry", packages: ["@sentry/"], hosts: ["ingest.sentry.io", "ingest.us.sentry.io", "ingest.de.sentry.io"] },
  { name: "Bugsnag", packages: ["@bugsnag/"], hosts: ["notify.bugsnag.com", "sessions.bugsnag.com"] },
  { name: "Datadog", packages: ["@datadog/", "dd-trace"], hosts: ["browser-intake-datadoghq.com", "browser-intake-datadoghq.eu"] },
  { name: "Rollbar", packages: ["rollbar"], hosts: ["api.rollbar.com"] },
  { name: "Honeybadger", packages: ["@honeybadger-io/"], hosts: ["api.honeybadger.io"] },
  { name: "New Relic", who: /new ?relic/i, packages: ["newrelic"] },
  { name: "Axiom", packages: ["@axiomhq/"], hosts: ["api.axiom.co"] },
  { name: "Better Stack", who: /better ?stack|logtail/i, packages: ["@logtail/"] },
  { name: "Mixpanel", packages: ["mixpanel", "mixpanel-browser"], hosts: ["api.mixpanel.com", "api-js.mixpanel.com", "api-eu.mixpanel.com"] },
  { name: "Amplitude", packages: ["@amplitude/", "amplitude-js"], hosts: ["api2.amplitude.com", "api.eu.amplitude.com"] },
  { name: "Heap", packages: ["@heap/", "heap-api"], hosts: ["heapanalytics.com"] },
  { name: "PostHog", packages: ["posthog-js", "posthog-node"], hosts: ["i.posthog.com", "app.posthog.com"] },
  { name: "Plausible", packages: ["plausible-tracker", "next-plausible"], hosts: ["plausible.io"] },
  { name: "Fathom", packages: ["fathom-client"], hosts: ["cdn.usefathom.com"] },
  { name: "Vercel Web Analytics", who: /vercel/i, packages: ["@vercel/analytics"] },
  { name: "Vercel Speed Insights", who: /vercel/i, packages: ["@vercel/speed-insights"] },
  { name: "Clerk", packages: ["@clerk/"], hosts: ["api.clerk.com", "api.clerk.dev"] },
  { name: "Auth0", packages: ["@auth0/"], hosts: ["auth0.com"] },
  { name: "Kinde", packages: ["@kinde-oss/"], hosts: ["kinde.com"] },
  { name: "WorkOS", packages: ["@workos-inc/"], hosts: ["api.workos.com"] },
  { name: "Firebase (Google)", who: /firebase|google/i, packages: ["firebase", "firebase-admin"], hosts: ["firebaseio.com", "firestore.googleapis.com", "identitytoolkit.googleapis.com"] },
  { name: "Supabase", packages: ["@supabase/"], hosts: ["supabase.co"] },
  { name: "Neon", packages: ["@neondatabase/serverless"], hosts: ["neon.tech"] },
  { name: "Vercel Postgres", who: /vercel|neon/i, packages: ["@vercel/postgres"] },
  { name: "Vercel KV", who: /vercel|upstash/i, packages: ["@vercel/kv"] },
  { name: "Vercel Blob", who: /vercel/i, packages: ["@vercel/blob"], hosts: ["blob.vercel-storage.com"] },
  { name: "PlanetScale", packages: ["@planetscale/database"], hosts: ["psdb.cloud"] },
  { name: "Upstash", packages: ["@upstash/"], hosts: ["upstash.io"] },
  { name: "Convex", packages: ["convex"], hosts: ["convex.cloud"] },
  { name: "Pinecone", packages: ["@pinecone-database/pinecone"], hosts: ["pinecone.io"] },
  { name: "Appwrite", packages: ["appwrite", "node-appwrite"], hosts: ["cloud.appwrite.io"] },
  { name: "Amazon S3", who: /amazon|aws|\bs3\b/i, packages: ["@aws-sdk/client-s3", "@aws-sdk/lib-storage", "@aws-sdk/s3-request-presigner"] },
  { name: "Google Cloud Storage", who: /google/i, packages: ["@google-cloud/storage"], hosts: ["storage.googleapis.com"] },
  { name: "Azure Blob Storage", who: /azure|microsoft/i, packages: ["@azure/storage-blob"] },
  { name: "Cloudinary", packages: ["cloudinary", "next-cloudinary"], hosts: ["api.cloudinary.com"] },
  { name: "UploadThing", packages: ["uploadthing", "@uploadthing/"], hosts: ["uploadthing.com"] },
  { name: "Uploadcare", packages: ["@uploadcare/"], hosts: ["upload.uploadcare.com", "api.uploadcare.com"] },
  { name: "Algolia", packages: ["algoliasearch", "@algolia/"], hosts: ["algolia.net", "algolianet.com"] },
  { name: "Pusher", packages: ["pusher", "pusher-js"], hosts: ["pusher.com"] },
  { name: "Ably", packages: ["ably"], hosts: ["ably.io"] },
  { name: "OneSignal", packages: ["@onesignal/", "onesignal-node"], hosts: ["onesignal.com"] },
  { name: "Google Maps", who: /google/i, packages: ["@googlemaps/", "@react-google-maps/api"], hosts: ["maps.googleapis.com"] },
  { name: "Mapbox", packages: ["mapbox-gl", "@mapbox/"], hosts: ["api.mapbox.com"] },
  { name: "Intercom", packages: ["@intercom/", "react-use-intercom"], hosts: ["api.intercom.io"] },
  { name: "Crisp", packages: ["crisp-sdk-web"], hosts: ["client.crisp.chat"] },
  { name: "Airtable", packages: ["airtable"], hosts: ["api.airtable.com"] },
  { name: "Notion", packages: ["@notionhq/client"], hosts: ["api.notion.com"] },
  { name: "Google Sheets", who: /google/i, packages: ["google-spreadsheet"], hosts: ["sheets.googleapis.com"] },
];

/** The AI SDK's gateway: the package "ai", given a model as "provider/model". */
const GATEWAY_MODEL = /\bmodel\s*:\s*["'`][\w.-]+\/[\w.:-]+["'`]/;

/**
 * Rule 4: ads, Google Analytics and Tag Manager, session recording, and
 * data brokers and hubs. Found by package, by import, by the address of a
 * script, or by a call. A script address counts only written as an address
 * ("//host…"), so a sentence naming the company doesn't.
 */
export const TRACKING = [
  { name: "the Meta Pixel or Conversions API", packages: ["react-facebook-pixel", "facebook-nodejs-business-sdk"], hosts: ["connect.facebook.net"] },
  { name: "Google Ads or AdSense", packages: ["react-adsense", "react-google-adsense"], hosts: ["pagead2.googlesyndication.com", "googleadservices.com", "doubleclick.net"] },
  { name: "the TikTok Pixel", hosts: ["analytics.tiktok.com"] },
  { name: "the LinkedIn Insight Tag", hosts: ["snap.licdn.com", "px.ads.linkedin.com"] },
  { name: "the X (Twitter) pixel", hosts: ["static.ads-twitter.com"] },
  { name: "the Reddit Pixel", hosts: ["redditstatic.com/ads"] },
  { name: "the Pinterest Tag", hosts: ["s.pinimg.com/ct"] },
  { name: "the Snap Pixel", hosts: ["sc-static.net/scevent"] },
  { name: "Microsoft Advertising (UET)", hosts: ["bat.bing.com"] },
  { name: "Criteo", hosts: ["static.criteo.net"] },
  { name: "Taboola", hosts: ["cdn.taboola.com"] },
  { name: "Outbrain", hosts: ["widgets.outbrain.com"] },
  {
    name: "Google Analytics",
    packages: ["react-ga", "react-ga4", "ga-4-react", "vue-gtag", "vue-gtag-next", "ngx-google-analytics", "@analytics/google-analytics", "universal-analytics", "nextjs-google-analytics", "@react-native-firebase/analytics", "nuxt-gtag", "@nuxtjs/google-analytics", "gatsby-plugin-google-gtag", "gatsby-plugin-google-analytics"],
    specifiers: ["firebase/analytics", "firebase/compat/analytics"],
    hosts: ["google-analytics.com", "googletagmanager.com/gtag"],
  },
  { name: "Google Tag Manager", packages: ["react-gtm-module", "@analytics/google-tag-manager", "@gtm-support/", "@nuxtjs/gtm", "gatsby-plugin-google-tagmanager"], hosts: ["googletagmanager.com"] },
  { name: "Hotjar", packages: ["@hotjar/browser", "react-hotjar"], hosts: ["static.hotjar.com", "script.hotjar.com"] },
  { name: "FullStory", packages: ["@fullstory/", "react-fullstory"], hosts: ["edge.fullstory.com", "fullstory.com/s/fs.js"] },
  { name: "LogRocket", packages: ["logrocket", "logrocket-react"], hosts: ["cdn.logrocket.io", "cdn.lr-ingest.io"] },
  { name: "Microsoft Clarity", packages: ["@microsoft/clarity", "react-microsoft-clarity"], hosts: ["clarity.ms"] },
  { name: "Smartlook", packages: ["smartlook-client"], hosts: ["web-sdk.smartlook.com"] },
  { name: "Mouseflow", hosts: ["cdn.mouseflow.com"] },
  { name: "rrweb, a session recorder", packages: ["rrweb", "rrweb-snapshot", "@rrweb/"] },
  { name: "OpenReplay", packages: ["@openreplay/"] },
  { name: "Highlight", packages: ["highlight.run", "@highlight-run/"] },
  { name: "Sentry's session replay", packages: ["@sentry/replay", "@sentry-internal/replay"], calls: [/\breplayIntegration\s*\(/g, /\bnew\s+(?:Sentry\.)?Replay\s*\(/g] },
  { name: "PostHog's session recording", calls: [/\bstartSessionRecording\s*\(/g, /\bsession_recording\s*:\s*\{/g] },
  { name: "Amplitude's session replay", packages: ["@amplitude/plugin-session-replay-browser", "@amplitude/session-replay-browser", "@amplitude/segment-session-replay-plugin"], calls: [/\bsessionReplayPlugin\s*\(/g] },
  { name: "Datadog's session replay", calls: [/\bsessionReplaySampleRate\s*:\s*[1-9]/g, /\bstartSessionReplayRecording\s*\(/g] },
  { name: "Mixpanel's session replay", calls: [/\brecord_sessions_percent\s*:\s*[1-9]/g, /\bstart_session_recording\s*\(/g] },
  { name: "Segment", packages: ["@segment/", "analytics-node"], hosts: ["cdn.segment.com"] },
  { name: "RudderStack", packages: ["@rudderstack/"], hosts: ["cdn.rudderlabs.com"] },
  { name: "mParticle", packages: ["@mparticle/"] },
  { name: "Tealium", packages: ["@tealium/"], hosts: ["tags.tiqcdn.com"] },
];

/** @next/third-parties ships Google Analytics and Tag Manager as components. */
const NEXT_THIRD_PARTIES_GOOGLE = /\bimport\s*\{([^}]{0,2000})\}\s*from\s*["']@next\/third-parties\/google["']/g;
const GOOGLE_COMPONENTS = /\b(GoogleAnalytics|GoogleTagManager|sendGAEvent|sendGTMEvent)\b/;

/**
 * Rule 8: secrets the tool can recognise. A finding names the file, the
 * line and the kind, never the secret. `real` can rule out a match by the
 * text around it.
 */
export const SECRETS = [
  { kind: "a private key", re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  // AWS's own documentation uses AKIAIOSFODNN7EXAMPLE; a key ending in EXAMPLE isn't one.
  { kind: "an AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, real: (m) => !m[0].endsWith("EXAMPLE") },
  { kind: "a GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { kind: "a Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "a Slack webhook address", re: /\bhooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{16,}/g },
  { kind: "a live Stripe key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/g },
  { kind: "a Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{24,}/g },
  { kind: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  // Found by the part every OpenAI key carries, then the prefix before it: linear on any text.
  { kind: "an OpenAI API key", re: /T3BlbkFJ[A-Za-z0-9_-]{8,}/g, real: (m, text) => /\bsk-[A-Za-z0-9_-]{0,200}$/.test(text.slice(Math.max(0, m.index - 210), m.index)) },
  { kind: "a SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}/g },
  { kind: "a Resend API key", re: /\bre_[A-Za-z0-9]{20,}\b/g, real: (m) => /\d/.test(m[0]) && /[A-Z]/.test(m[0]) && /[a-z]/.test(m[0].slice(3)) },
  // A Firebase web config's apiKey is public by design; any other Google key isn't.
  { kind: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, real: (m, text) => !/authDomain|firebaseapp\.com|messagingSenderId|storageBucket/.test(text.slice(Math.max(0, m.index - 400), m.index + 400)) },
  { kind: "a Groq API key", re: /\bgsk_[A-Za-z0-9]{40,}/g },
  { kind: "a Replicate API token", re: /\br8_[A-Za-z0-9]{30,}/g },
  { kind: "a Hugging Face token", re: /\bhf_[A-Za-z0-9]{30,}/g },
  { kind: "a Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { kind: "an npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  {
    kind: "a database address with a password",
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb|rediss?|amqps?)(?:\+[a-z0-9]+)?(?:\+srv)?:\/\/[^\s:@/"'`]+:([^\s@/"'`]+)@([^\s/:"'`?#]+)/g,
    real: (m) => !isPlaceholderPassword(m[1]) && !isLocalHost(m[2]),
  },
];

/** Environment files. Examples are scanned like any file; the others hold secrets by design. */
const ENV_FILE = /^(?:\.env(?:\..+)?|\.dev\.vars|\.envrc)$/i;
const ENV_EXAMPLE = /^\.env\.(?:example|sample|template|dist|defaults)$/i;
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|PWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|AUTH|DSN|DATABASE_URL|DB_URL|CONNECTION_STRING/i;
const PLACEHOLDER_VALUE = /^(?:|<[^>]*>|\$\{[^}]*\}|x+|\*+|\.+|changeme|change-me|todo|placeholder|example|dummy|your[-_ ].*|replace[-_ ]?me)$/i;
/** Files that hold a database: people's data, which rule 8 keeps out of the repository. */
const DATABASE_FILE = /\.(?:db|sqlite|sqlite3|db3)$/i;

function isPlaceholderPassword(password) {
  return /^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|<[^>]*>|\[[^\]]*\]|\*+|x+|\.\.\.|password|passwd|pass|secret|changeme|postgres|root|user|example|test|dev|local)$/i.test(password);
}

function isLocalHost(host) {
  const h = host.toLowerCase();
  if (!h.includes(".")) return true; // localhost, or a service in docker compose ("db")
  return /^(?:127\.\d+\.\d+\.\d+|0\.0\.0\.0)$/.test(h) || /\.(?:local|localhost|test|example|invalid)$/.test(h);
}

/**
 * Rule 9: phrases that present a project as its users' property, or as
 * approved by our.one. A phrase right after a denial ("not approved by
 * our.one") is let through.
 */
export const CLAIMS = [
  { re: /\b(?:users?|members?|community|people|customers?)[- ]owned\b/gi, what: "presents it as its users' property" },
  { re: /\bowned\s+(?:and\s+[\w-]+\s+)?by\s+(?:all\s+(?:of\s+)?)?(?:(?:its|their|our|the)\s+)?(?:own\s+)?(?:users|members|people|community|customers)\b/gi, what: "presents it as its users' property" },
  { re: /\b(?:its|the|our)\s+(?:users|members|people|community)\s+(?:now\s+|together\s+|jointly\s+|collectively\s+)?own\s+(?:it|this)\b/gi, what: "presents it as its users' property" },
  { re: /\b(?:approved|certified|endorsed|verified|vetted|accredited|listed|protected|hosted|backed|guaranteed)\s+(?:by|on|in)\s+our\.one\b/gi, what: "presents it as approved, listed or protected by our.one" },
  { re: /\bour\.one[- ](?:approved|certified|verified|endorsed|protected|listed|backed)\b/gi, what: "presents it as approved, listed or protected by our.one" },
];
const DENIAL = /\b(?:not|never|nor|isn't|aren't|wasn't|weren't|no longer|hasn't been|haven't been|has not been|have not been)\s+(?:yet\s+|been\s+)*$/i;

/** Open-source licences, by SPDX id, with words their full text always carries. */
export const LICENCES = {
  "Apache-2.0": [/Apache License/i, /Version 2\.0, January 2004/i],
  MIT: [/Permission is hereby granted, free of charge, to any person obtaining a copy/i],
  "MIT-0": [/Permission is hereby granted, free of charge, to any person obtaining a copy/i],
  "BSD-2-Clause": [/Redistribution and use in source and binary forms, with or without\s+modification, are permitted provided that the following conditions\s+are met/i],
  "BSD-3-Clause": [/Redistribution and use in source and binary forms, with or without\s+modification, are permitted provided that the following conditions\s+are met/i, /Neither the name of/i],
  ISC: [/Permission to use, copy, modify, and\/or distribute this software for any\s+purpose with or without fee is hereby granted, provided that/i],
  "0BSD": [/Permission to use, copy, modify, and\/or distribute this software for any\s+purpose with or without fee is hereby granted/i],
  "MPL-2.0": [/Mozilla Public License,? Version 2\.0/i, /Definitions/i],
  "GPL-2.0-only": [/GNU GENERAL PUBLIC LICENSE/i, /Version 2, June 1991/i],
  "GPL-2.0-or-later": [/GNU GENERAL PUBLIC LICENSE/i, /Version 2, June 1991/i],
  "GPL-3.0-only": [/GNU GENERAL PUBLIC LICENSE/i, /Version 3, 29 June 2007/i],
  "GPL-3.0-or-later": [/GNU GENERAL PUBLIC LICENSE/i, /Version 3, 29 June 2007/i],
  "LGPL-2.1-only": [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 2\.1, February 1999/i],
  "LGPL-2.1-or-later": [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 2\.1, February 1999/i],
  "LGPL-3.0-only": [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 3, 29 June 2007/i],
  "LGPL-3.0-or-later": [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 3, 29 June 2007/i],
  "AGPL-3.0-only": [/GNU AFFERO GENERAL PUBLIC LICENSE/i, /Version 3, 19 November 2007/i],
  "AGPL-3.0-or-later": [/GNU AFFERO GENERAL PUBLIC LICENSE/i, /Version 3, 19 November 2007/i],
  "EPL-2.0": [/Eclipse Public License - v 2\.0/i],
  "EUPL-1.2": [/EUROPEAN UNION PUBLIC LICEN[CS]E v\. ?1\.2/i],
  Unlicense: [/This is free and unencumbered software released into the public domain/i, /Anyone is free to copy, modify, publish, use, compile, sell, or\s+distribute/i],
  "BSL-1.0": [/Boost Software License - Version 1\.0 - August 17th, 2003/i],
  Zlib: [/This software is provided 'as-is', without any express or implied/i, /Permission is granted to anyone to use this software for any purpose/i],
  "Artistic-2.0": [/The Artistic License 2\.0/i],
  "UPL-1.0": [/The Universal Permissive License \(UPL\), Version 1\.0/i],
};

const LICENCE_FILE = /^(?:licen[cs]e|copying)(?:[-.][\w.-]+)?$/i;

/* ------------------------------------------------------------ the files */

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".output", ".vercel", ".turbo", "dist", "build", "out", "coverage", "vendor", ".cache", "target", "__pycache__", ".venv", "venv"]);
const MAX_BYTES = 1_000_000;
/** Secrets are looked for in larger files too: a built bundle can carry a key. */
const MAX_SECRET_BYTES = 20_000_000;
const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const MARKUP = /\.(?:html?|[cm]?[jt]sx?|vue|svelte|astro|mdx|ejs|hbs|handlebars|liquid|njk|pug|php|erb)$/i;
/** Files whose text people read: pages, templates and the code that writes them. */
const READ_BY_PEOPLE = /\.(?:html?|[cm]?[jt]sx?|vue|svelte|astro|mdx|ejs|hbs|handlebars|liquid|njk|pug|erb)$/i;
/** Message files that internationalised apps keep their words in. */
const MESSAGES = /(?:^|\/)(?:messages|locales?|i18n|lang|translations)\/(?:[^/]+\/)*[^/]+\.json$/i;
/** Code in a language the tool doesn't read. */
const OTHER_LANGUAGE = /\.(?:py|rb|go|php|java|kt|kts|cs|rs|ex|exs|swift|scala|dart|clj)$/i;
const OTHER_LANGUAGE_NAMES = { py: "Python", rb: "Ruby", go: "Go", php: "PHP", java: "Java", kt: "Kotlin", kts: "Kotlin", cs: "C#", rs: "Rust", ex: "Elixir", exs: "Elixir", swift: "Swift", scala: "Scala", dart: "Dart", clj: "Clojure" };
const TEST = /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|e2e|spec|fixtures?|cypress|playwright|test-utils)\/|\.(?:test|spec|stories|cy|e2e)\.[cm]?[jt]sx?$|(?:^|\/)(?:vitest|jest|playwright|cypress)\.(?:setup|config)\.[cm]?[jt]s$|(?:^|\/)setupTests\.[cm]?[jt]sx?$/i;

function toPosix(path) {
  return path.split(sep).join("/");
}

/** The folder holding the git repository this folder is in, or null. Found by looking for .git, without running git. */
function gitRootOf(root) {
  let dir = root;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Files under the project, as posix paths relative to it: git's list where
 * git can run, without dependencies (node_modules) and without build output
 * git doesn't track; otherwise the folder, walked. git runs with the
 * project's own fsmonitor turned off: that setting names a program git
 * would start.
 */
function listFiles(root) {
  let out;
  try {
    out = execFileSync("git", ["-c", "core.fsmonitor=false", "ls-files", "-z", "-t", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    const files = [];
    walk(root, "", files);
    return { files, tracked: null, git: false, gitRoot: gitRootOf(root) };
  }
  const seen = new Set();
  const tracked = new Set();
  const files = [];
  for (const entry of out.split("\0")) {
    if (entry.length < 3) continue;
    const tag = entry[0];
    const rel = entry.slice(2);
    const segments = rel.split("/");
    if (segments.includes("node_modules")) continue;
    if (tag === "?" && segments.some((s) => SKIP_DIRS.has(s))) continue;
    if (seen.has(rel) || !isPlainFile(join(root, rel))) continue;
    seen.add(rel);
    if (tag !== "?") tracked.add(rel);
    files.push(rel);
  }
  return { files, tracked, git: true, gitRoot: gitRootOf(root) };
}

function walk(root, rel, out) {
  let entries;
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, path, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
}

/** A regular file, not a link: a link could point outside the project. */
function isPlainFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Is this path, followed through any link, inside the project? */
function insideProject(root, rel) {
  try {
    const real = realpathSync(root);
    const target = realpathSync(join(root, rel));
    return target === real || target.startsWith(real + sep);
  } catch {
    return false;
  }
}

/**
 * May init write `rel`? Only inside the project, and never through a link:
 * neither the file nor any folder on its way may lead outside the project,
 * and the file may not be a second name for one elsewhere (a hard link).
 */
function writable(root, rel) {
  let real;
  try {
    real = realpathSync(root);
  } catch {
    return false;
  }
  let dir = dirname(join(root, rel));
  while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir);
  let realDir;
  try {
    realDir = realpathSync(dir);
  } catch {
    return false;
  }
  if (realDir !== real && !realDir.startsWith(real + sep)) return false;
  const path = join(root, rel);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.nlink > 1 || !stat.isFile()) return false;
  } catch {
    // Not there yet: fine.
  }
  return true;
}

/** A file's text, or null when it is too large, binary or can't be read; what was left unread is noted. */
function readText(root, rel, skipped, limit = MAX_BYTES) {
  const path = join(root, rel);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    if (!skipped.unreadable.includes(rel)) skipped.unreadable.push(rel);
    return null;
  }
  if (size > limit) {
    if (!skipped.large.includes(rel)) skipped.large.push(rel);
    return null;
  }
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    if (!skipped.unreadable.includes(rel)) skipped.unreadable.push(rel);
    return null;
  }
  if (buffer.subarray(0, 8000).includes(0)) {
    skipped.binary += 1;
    return null;
  }
  return withoutBom(buffer.toString("utf8"));
}

function withoutBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Line numbers for positions in `text`, from a table of where each line starts. */
function lineFinder(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/* ------------------------------------------------------------ code */

/**
 * JavaScript's comments, blanked to spaces with every newline kept, so
 * positions and line numbers still match the file. Strings, template
 * literals and regular expressions are stepped over, so a "//" inside one
 * isn't taken for a comment.
 */
export function stripComments(text) {
  const out = text.split("");
  const n = text.length;
  let prev = "";
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i = endOfString(text, i, c);
      prev = c;
      continue;
    }
    if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev))) {
      i = endOfRegex(text, i);
      prev = "/";
      continue;
    }
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") prev = c;
    i += 1;
  }
  return out.join("");
}

function endOfString(text, start, quote) {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === "\n" && quote !== "`") return i;
    i += 1;
  }
  return i;
}

function endOfRegex(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") return start + 1;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i += 1;
      while (i < text.length && /[a-z]/i.test(text[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return start + 1;
}

const STATEMENT_HEAD = /^\s+(?!type\s)[\w$*{},\s]*$/;

/**
 * Every module a file imports, with its line and how: `import … from`,
 * `export … from`, `import "x"`, a dynamic import, or `require`. Type-only
 * imports bring no code and are left out; comments are read past.
 */
export function importsOf(text) {
  const code = stripComments(text);
  const at = lineFinder(code);
  const found = [];
  for (const m of code.matchAll(/\bfrom\s*(["'`])([^"'`\n]{1,300})\1/g)) {
    const floor = Math.max(0, m.index - 2000);
    const imp = code.lastIndexOf("import", m.index);
    const exp = code.lastIndexOf("export", m.index);
    const start = Math.max(imp, exp);
    if (start < floor) continue;
    if (/[\w$]/.test(code[start - 1] ?? "")) continue;
    if (!STATEMENT_HEAD.test(code.slice(start + 6, m.index))) continue;
    found.push({ spec: m[2], line: at(m.index), kind: start === exp ? "export" : "import" });
  }
  for (const m of code.matchAll(/\bimport\s*(["'`])([^"'`\n]{1,300})\1/g)) found.push({ spec: m[2], line: at(m.index), kind: "import" });
  for (const m of code.matchAll(/\b(import|require)\s*\(\s*(["'`])([^"'`\n$]{1,300})\2\s*\)/g)) found.push({ spec: m[3], line: at(m.index), kind: m[1] });
  return found.sort((a, b) => a.line - b.line);
}

/** The package a module name belongs to, or null for a file, a built-in or an alias. */
export function packageOf(spec) {
  if (/^(?:\.|\/|~|#|@\/|[a-z][a-z0-9+.-]*:)/i.test(spec)) return null;
  const parts = spec.split("/");
  if (spec.startsWith("@")) return parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null;
  return parts[0] || null;
}

/** Does a module name (or package name) match a list entry? */
function matches(entry, spec) {
  if (entry.endsWith("/")) return spec.startsWith(entry);
  return spec === entry || spec.startsWith(`${entry}/`);
}

/** The addresses written in code, with the host each names. */
function addressesIn(code) {
  const out = [];
  for (const m of code.matchAll(/\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) out.push({ host: m[1].toLowerCase(), index: m.index });
  return out;
}

function hostMatches(host, entry) {
  return host === entry || host.endsWith(`.${entry}`);
}

/* ------------------------------------------------------------ project */

function loadProject(root) {
  const skipped = { large: [], binary: 0, unreadable: [] };
  const listed = listFiles(root);
  const { files, git, tracked } = listed;
  const self = selfInside(root);
  const toolPath = fileURLToPath(import.meta.url);
  const selfHash = sha256(readFileSync(toolPath));
  const selfSize = statSync(toolPath).size;
  const texts = new Map();
  const isSelfCopy = (rel) => {
    if (rel === self) return true;
    try {
      const path = join(root, rel);
      return statSync(path).size === selfSize && sha256(readFileSync(path)) === selfHash;
    } catch {
      return false;
    }
  };
  const readable = [];
  for (const rel of files) {
    if (ENV_FILE.test(basename(rel)) && !ENV_EXAMPLE.test(basename(rel))) continue; // read only by the secrets check
    if (isSelfCopy(rel)) continue;
    readable.push(rel);
  }
  const text = (rel) => {
    if (!texts.has(rel)) texts.set(rel, readText(root, rel, skipped));
    return texts.get(rel);
  };

  let manifest = null;
  let manifestError = null;
  const manifestPath = join(root, MANIFEST);
  if (isLink(manifestPath)) {
    manifestError = "It is a link, and the check reads only the project's own files.";
  } else if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(withoutBom(readFileSync(manifestPath, "utf8")));
    } catch (error) {
      manifestError = whereItBroke(error);
    }
  }

  let pkg = null;
  if (isPlainFile(join(root, "package.json"))) {
    try {
      pkg = JSON.parse(withoutBom(readFileSync(join(root, "package.json"), "utf8")));
    } catch {
      pkg = null;
    }
  }

  // Code: its imports, its addresses, and where it reaches a store.
  const code = new Map();
  for (const rel of readable) {
    if (!SOURCE.test(rel) || TEST.test(rel)) continue;
    const t = text(rel);
    if (t === null) continue;
    code.set(rel, stripComments(t));
  }
  const imports = [];
  for (const [rel] of code) for (const i of importsOf(text(rel))) imports.push({ ...i, file: rel });

  const storeUses = [];
  for (const i of imports) {
    if (STORES.some((s) => matches(s, i.spec))) storeUses.push({ file: i.file, line: i.line, what: i.spec, kind: i.kind === "export" ? "re-export" : "client" });
  }
  for (const [rel, c] of code) {
    const at = lineFinder(c);
    for (const call of STORE_CALLS) for (const m of c.matchAll(call.re)) storeUses.push({ file: rel, line: at(m.index), what: call.name, kind: "client" });
    for (const q of STORE_QUERIES) for (const m of c.matchAll(q.re)) storeUses.push({ file: rel, line: at(m.index), what: q.name, kind: "query" });
    const usesFs = imports.some((i) => i.file === rel && FS_MODULES.includes(i.spec));
    if (usesFs) for (const m of c.matchAll(FS_WRITES)) storeUses.push({ file: rel, line: at(m.index), what: "a file written with fs", kind: "client" });
  }

  const deps = new Set();
  if (pkg && typeof pkg === "object") {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      const block = pkg[field];
      if (block && typeof block === "object") for (const name of Object.keys(block)) deps.add(name);
    }
  }

  const otherLanguage = readable.filter((f) => OTHER_LANGUAGE.test(f) && !TEST.test(f));

  return { root, files, git, tracked, gitRoot: listed.gitRoot, readable, text, manifest, manifestError, pkg, code, imports, storeUses, deps, otherLanguage, skipped };
}

/** Where a JSON document broke, as a line and a column: never the text around it, which could hold a secret. */
function whereItBroke(error) {
  const message = error instanceof Error ? error.message : "";
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return `It doesn't parse, near line ${lc[1]}, column ${lc[2]}.`;
  const pos = /position (\d+)/.exec(message);
  if (pos) return `It doesn't parse, near character ${pos[1]}.`;
  return "It doesn't parse.";
}

function selfInside(root) {
  const self = fileURLToPath(import.meta.url);
  let raw;
  try {
    raw = relative(realpathSync(root), self);
  } catch {
    raw = relative(root, self);
  }
  if (!raw || isAbsolute(raw)) return null;
  const rel = toPosix(raw);
  return rel.startsWith("../") || rel === ".." ? null : rel;
}

/* ------------------------------------------------------------ checks */

const PASS = "pass";
const FAIL = "fail";
const NOT_CHECKED = "not-checked";

function result(id, title, cls, outcome, summary, findings = []) {
  return { id, title, class: cls, outcome, summary, findings };
}

function isTodo(value) {
  return typeof value === "string" && /\bTODO\b/.test(value);
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[A-Za-z]{2,}$/.test(value);
}

function str(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

/** A user's text, shortened, for a message. */
function quoted(value) {
  const s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

/** An answer that says the thing doesn't exist: "N/A", "Not built yet.", "TBD". */
const NON_ANSWER = /^\s*(?:n\/?a|none|no|nothing|not (?:built|available|supported|implemented|possible|done)(?: yet)?|not yet|tbd|tbc|todo|coming soon|later|soon|-+|\?+)\s*\.?\s*$/i;

export const TOP_KEYS = ["$schema", "rules", "name", "purpose", "maintainers", "source", "license", "costs", "data", "claims"];
export const DATA_KEYS = ["collects", "sharedWith", "boundary", "noPersonalData", "export", "delete"];

/** The manifest's shape (STRUCTURAL). Every problem is listed at once. */
function checkManifest(p) {
  const id = "manifest";
  const title = "our.one.json is present and complete";
  if (p.manifestError !== null) {
    return result(id, title, "STRUCTURAL", FAIL, "our.one.json isn't valid JSON.", [
      { message: p.manifestError, file: MANIFEST, fix: "Fix the JSON. Comments and trailing commas aren't allowed." },
    ]);
  }
  if (p.manifest === null) {
    return result(id, title, "STRUCTURAL", FAIL, "There is no our.one.json.", [
      { message: "This project has no our.one.json.", fix: `run node ${DEFAULT_TOOL_PATH} init, then fill it in.` },
    ]);
  }
  const m = p.manifest;
  const problems = [];
  // A field that still says TODO is reported once, as TODO, not also as malformed.
  const todos = [];
  const walkTodo = (value, path) => {
    if (isTodo(value)) todos.push(path);
    else if (Array.isArray(value)) value.forEach((v, i) => walkTodo(v, `${path}[${i}]`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walkTodo(v, path ? `${path}.${k}` : k);
  };
  walkTodo(m, "");
  const todo = new Set(todos);
  const add = (message, fix, path) => {
    if (path && todo.has(path)) return;
    problems.push({ message, file: MANIFEST, fix });
  };
  if (typeof m !== "object" || Array.isArray(m)) {
    add("It must be a JSON object.", `Start again with: node ${DEFAULT_TOOL_PATH} init`);
    return result(id, title, "STRUCTURAL", FAIL, "our.one.json isn't an object.", problems);
  }
  for (const key of Object.keys(m)) {
    if (!TOP_KEYS.includes(key)) {
      const hint = key.toLowerCase() === "licence" ? ' It is spelled "license", as in package.json.' : "";
      add(`Unknown field "${quoted(key)}".${hint}`, `Remove it. The fields are: ${TOP_KEYS.join(", ")}.`);
    }
  }
  if (m.rules !== RULES_VERSION) add(`"rules" must be "${RULES_VERSION}", the rules version this tool checks.`, `Set "rules": "${RULES_VERSION}".`);
  if (!str(m.name, 1, 80)) add('"name" must be the project\'s name, up to 80 characters.', "Write its name.", "name");
  if (!str(m.purpose, 1, 280)) add('"purpose" must say in one sentence what it does for the people who use it (up to 280 characters).', "Write that sentence.", "purpose");
  if (!Array.isArray(m.maintainers) || m.maintainers.length === 0 || m.maintainers.length > 20) {
    add('"maintainers" must list from 1 to 20 people, each with a name and a contact.', 'Add [{"name": "…", "contact": "…"}].');
  } else {
    m.maintainers.forEach((person, i) => {
      if (typeof person !== "object" || person === null || Array.isArray(person)) {
        add(`maintainers[${i}] must be an object with "name" and "contact".`, "Fix it.");
        return;
      }
      for (const key of Object.keys(person)) if (!["name", "contact"].includes(key)) add(`maintainers[${i}] has an unknown field "${quoted(key)}".`, "Remove it.");
      if (!str(person.name, 1, 80)) add(`maintainers[${i}].name is missing.`, "Write the person's name.", `maintainers[${i}].name`);
      if (!isEmail(person.contact) && !isHttpsUrl(person.contact)) add(`maintainers[${i}].contact must be an email address or an https:// link.`, "Write one.", `maintainers[${i}].contact`);
    });
  }
  if (!isHttpsUrl(m.source)) add('"source" must be the https:// address of the project\'s public repository.', "Write it.", "source");
  if (typeof m.license !== "string" || !m.license.trim()) add('"license" must be the SPDX id of its open-source licence, such as "Apache-2.0".', "Write it.", "license");
  if (typeof m.costs !== "string" || !m.costs.trim()) add('"costs" must be the path of the file that shows what it costs to run.', 'Write "COSTS.md", or another file.', "costs");
  const d = m.data;
  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    add('"data" must be an object: collects, sharedWith, boundary, export and delete.', `Start from the one init writes: node ${DEFAULT_TOOL_PATH} init`);
  } else {
    for (const key of Object.keys(d)) if (!DATA_KEYS.includes(key)) add(`Unknown field "data.${quoted(key)}".`, `Remove it. The fields are: ${DATA_KEYS.join(", ")}.`);
    if (!Array.isArray(d.collects)) {
      add('"data.collects" must be a list, empty only if it keeps nothing about anyone.', 'Add [{"what": "…", "why": "…", "kept": "…"}] for each kind of personal data.');
    } else {
      d.collects.forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return add(`data.collects[${i}] must be an object.`, "Fix it.");
        for (const key of Object.keys(item)) if (!["what", "why", "kept"].includes(key)) add(`data.collects[${i}] has an unknown field "${quoted(key)}".`, 'The fields are "what", "why" and "kept".');
        if (!str(item.what, 1, 600)) add(`data.collects[${i}].what is missing, or longer than 600 characters.`, "Say what is kept.", `data.collects[${i}].what`);
        if (!str(item.why, 1, 600)) add(`data.collects[${i}].why is missing, or longer than 600 characters.`, "Say why the service needs it.", `data.collects[${i}].why`);
        if (!str(item.kept, 1, 400)) add(`data.collects[${i}].kept is missing, or longer than 400 characters.`, "Say how long it is kept.", `data.collects[${i}].kept`);
      });
    }
    if (!Array.isArray(d.sharedWith)) {
      add('"data.sharedWith" must be a list, empty only if nothing about a person leaves the project.', 'Add [{"who": "…", "what": "…", "why": "…", "packages": ["…"]}].');
    } else {
      d.sharedWith.forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return add(`data.sharedWith[${i}] must be an object.`, "Fix it.");
        for (const key of Object.keys(item)) if (!["who", "what", "why", "packages"].includes(key)) add(`data.sharedWith[${i}] has an unknown field "${quoted(key)}".`, 'The fields are "who", "what", "why" and "packages".');
        if (!str(item.who, 1, 120)) add(`data.sharedWith[${i}].who is missing, or longer than 120 characters.`, "Name the service.", `data.sharedWith[${i}].who`);
        if (!str(item.what, 1, 400)) add(`data.sharedWith[${i}].what is missing, or longer than 400 characters.`, "Say what it receives.", `data.sharedWith[${i}].what`);
        if (!str(item.why, 1, 600)) add(`data.sharedWith[${i}].why is missing, or longer than 600 characters.`, "Say why.", `data.sharedWith[${i}].why`);
        if (item.packages !== undefined && (!Array.isArray(item.packages) || item.packages.some((x) => !str(x, 1, 214)))) add(`data.sharedWith[${i}].packages must be a list of package names.`, "Fix it.");
      });
    }
    if (d.boundary !== undefined && (!Array.isArray(d.boundary) || d.boundary.some((x) => typeof x !== "string"))) add('"data.boundary" must be a list of folders.', 'For example ["src/data"].');
    if (d.noPersonalData !== undefined && !str(d.noPersonalData, 1, 600)) add('"data.noPersonalData" must say, in a sentence, why it keeps nothing about anyone.', "Write it, or remove it.", "data.noPersonalData");
    if (!str(d.export, 1, 400)) add('"data.export" must say how a person downloads their data.', 'For example "Settings, then Download your data".', "data.export");
    if (!str(d.delete, 1, 400)) add('"data.delete" must say how a person deletes their data.', 'For example "Settings, then Delete account".', "data.delete");
  }
  if (m.claims !== undefined) {
    const c = m.claims;
    if (typeof c !== "object" || c === null || Array.isArray(c) || Object.keys(c).some((k) => !["allowed", "skip"].includes(k))) {
      add('"claims" may only hold "allowed" (a list of {file, text, why}) and "skip" (a list of {file, why}).', "Fix it, or remove it.");
    } else {
      if (c.allowed !== undefined && !Array.isArray(c.allowed)) add('"claims.allowed" must be a list.', "Fix it.");
      (Array.isArray(c.allowed) ? c.allowed : []).forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item) || Object.keys(item).some((k) => !["file", "text", "why"].includes(k)) || !str(item.file, 1, 400) || !str(item.text, 8, 600) || !str(item.why, 8, 600)) {
          add(`claims.allowed[${i}] needs "file", "text" (the exact sentence) and "why".`, "Fix it.");
        }
      });
      if (c.skip !== undefined && !Array.isArray(c.skip)) add('"claims.skip" must be a list.', "Fix it.");
      (Array.isArray(c.skip) ? c.skip : []).forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item) || Object.keys(item).some((k) => !["file", "why"].includes(k)) || !str(item.file, 1, 400) || !str(item.why, 8, 600)) {
          add(`claims.skip[${i}] needs "file" (one file) and "why".`, "Fix it.");
        }
      });
    }
  }
  for (const path of todos) problems.push({ message: `${path} still says TODO.`, file: MANIFEST, fix: "Fill it in with the person's answer." });
  return problems.length === 0
    ? result(id, title, "STRUCTURAL", PASS, "our.one.json is complete.")
    : result(id, title, "STRUCTURAL", FAIL, `our.one.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}.`, problems);
}

/** The licence files at a folder: LICENSE and its kin, and a REUSE-style LICENSES/ folder. */
function licenceFilesAt(dir) {
  const out = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) if (LICENCE_FILE.test(name) && isPlainFile(join(dir, name))) out.push(join(dir, name));
  let reuse = [];
  try {
    reuse = readdirSync(join(dir, "LICENSES"));
  } catch {
    reuse = [];
  }
  for (const name of reuse) if (/\.(?:txt|md)$/i.test(name) && isPlainFile(join(dir, "LICENSES", name))) out.push(join(dir, "LICENSES", name));
  return out;
}

/** The licence (CHECKED): open source, in a licence file here or at the repository's root, the same as package.json's. */
function checkLicence(p) {
  const id = "licence";
  const title = "It has an open-source licence";
  const declared = p.manifest && typeof p.manifest.license === "string" ? p.manifest.license.trim() : "";
  if (!declared || isTodo(declared)) {
    return result(id, title, "CHECKED", FAIL, "No licence is named in our.one.json.", [
      { message: '"license" names no licence.', file: MANIFEST, fix: "Ask the person which open-source licence to use (Apache-2.0 is the feed's), add its full text as LICENSE, and name it here." },
    ]);
  }
  const findings = [];
  const ids = declared.replace(/^\(|\)$/g, "").split(/\s+OR\s+/);
  const known = new Map(Object.keys(LICENCES).map((k) => [k.toLowerCase(), k]));
  const canonical = ids.map((x) => known.get(x.trim().toLowerCase()) ?? null);
  if (canonical.some((x) => x === null)) {
    findings.push({ message: `"${quoted(declared)}" isn't on the tool's list of open-source licences.`, file: MANIFEST, fix: `Use one of: ${Object.keys(LICENCES).join(", ")}. (A choice of two is written "MIT OR Apache-2.0".)` });
  }
  let files = licenceFilesAt(p.root);
  let atRoot = false;
  if (files.length === 0 && p.gitRoot && p.gitRoot !== p.root) {
    files = licenceFilesAt(p.gitRoot);
    atRoot = files.length > 0;
  }
  const names = files.map((f) => toPosix(relative(p.root, f)));
  if (files.length === 0) {
    findings.push({ message: "There is no licence file (LICENSE, LICENCE or COPYING) at the project's root, or at the repository's.", fix: "Add the licence's full text as LICENSE." });
  } else if (canonical.every((x) => x !== null)) {
    const texts = files.map((f) => {
      try {
        return readFileSync(f, "utf8");
      } catch {
        return "";
      }
    });
    for (const licence of canonical) {
      if (!texts.some((t) => LICENCES[licence].every((re) => re.test(t)))) {
        findings.push({ message: `No licence file holds the full text of ${licence}.`, file: names[0], fix: `Put the full text of ${licence} in ${names[0]}: a line naming it isn't enough.` });
      }
    }
  }
  const pkgLicense = p.pkg && typeof p.pkg.license === "string" ? p.pkg.license.trim() : null;
  if (pkgLicense && pkgLicense.toLowerCase() !== declared.toLowerCase()) {
    findings.push({ message: `package.json says "${quoted(pkgLicense)}", our.one.json says "${quoted(declared)}".`, file: "package.json", fix: "Make them the same." });
  }
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, `${canonical.join(" or ")}, in ${names.join(", ")}${atRoot ? ", at the repository's root" : ""}.`)
    : result(id, title, "CHECKED", FAIL, "The licence isn't in order.", findings);
}

/** The rules block in AGENTS.md (CHECKED): present once, and word for word. */
function checkAgents(p) {
  const id = "agents";
  const title = "AGENTS.md carries the rules, unchanged";
  const fix = `run node ${DEFAULT_TOOL_PATH} init. It puts the block back word for word.`;
  const agentsFile = p.files.find((f) => f.toLowerCase() === "agents.md") ?? null;
  if (!agentsFile) return result(id, title, "CHECKED", FAIL, "There is no AGENTS.md.", [{ message: "There is no AGENTS.md, so agents working on this code don't get the rules.", fix }]);
  const text = normaliseBlock(p.text(agentsFile) ?? "");
  const at = lineFinder(text);
  const begins = [...text.matchAll(/<!-- our\.one rules ([\w.-]+): begin/g)];
  if (begins.length === 0) return result(id, title, "CHECKED", FAIL, "AGENTS.md has no rules block.", [{ message: "AGENTS.md doesn't carry the our.one rules.", file: agentsFile, fix }]);
  if (begins.length > 1) {
    return result(id, title, "CHECKED", FAIL, `AGENTS.md has ${begins.length} rules blocks.`, [
      { message: "AGENTS.md carries more than one rules block, and an agent reads them all.", file: agentsFile, line: at(begins[1].index), fix },
    ]);
  }
  const version = begins[0][1];
  if (version !== RULES_VERSION) {
    return result(id, title, "CHECKED", FAIL, `AGENTS.md carries rules ${version}.`, [
      { message: `The block is for rules ${version}; this tool checks rules ${RULES_VERSION}.`, file: agentsFile, line: at(begins[0].index), fix },
    ]);
  }
  if (text.indexOf(normaliseBlock(RULES_BLOCK)) === -1) {
    return result(id, title, "CHECKED", FAIL, "The rules block in AGENTS.md was changed.", [
      { message: "The rules block isn't word for word what the tool expects.", file: agentsFile, line: at(begins[0].index), fix },
    ]);
  }
  return result(id, title, "CHECKED", PASS, `${agentsFile} carries rules ${RULES_VERSION}, unchanged.`);
}

function normaliseBlock(text) {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n");
}

/** What it does with personal data is declared (STRUCTURAL), and squares with the code. */
function checkData(p) {
  const id = "data";
  const title = "Its personal data is declared";
  const d = p.manifest?.data;
  if (!d || typeof d !== "object") return result(id, title, "STRUCTURAL", FAIL, "our.one.json has no data section.", [{ message: "There is no data section.", file: MANIFEST, fix: "Fill in data: collects, sharedWith, boundary, export and delete." }]);
  const findings = [];
  const collects = Array.isArray(d.collects) ? d.collects : null;
  const shared = Array.isArray(d.sharedWith) ? d.sharedWith : null;
  if (!collects) findings.push({ message: "data.collects isn't a list.", file: MANIFEST, fix: "List what it keeps about people." });
  if (!shared) findings.push({ message: "data.sharedWith isn't a list.", file: MANIFEST, fix: "List the outside services that receive anything about people." });
  const answer = (value) => str(value, 1, 400) && !isTodo(value) && !NON_ANSWER.test(value);
  if (!answer(d.export)) findings.push({ message: "data.export doesn't say how a person downloads their data.", file: MANIFEST, fix: "Build it, and say how. If it keeps nothing about anyone, say that instead." });
  if (!answer(d.delete)) findings.push({ message: "data.delete doesn't say how a person deletes their data.", file: MANIFEST, fix: "Build it, and say how. If it keeps nothing about anyone, say that instead." });
  const why = str(d.noPersonalData, 1, 600) && !isTodo(d.noPersonalData);
  if (collects && collects.length === 0) {
    const reasons = [];
    if (p.storeUses.length > 0) reasons.push("the code uses a database or a file store");
    if (shared && shared.length > 0) reasons.push("data.sharedWith names services that receive something");
    if (reasons.length > 0 && !why) {
      findings.push({ message: `data.collects is empty, but ${reasons.join(", and ")}.`, file: MANIFEST, fix: "List what it keeps about people. If it truly keeps nothing about anyone, say why in data.noPersonalData; a person will read it." });
    }
  }
  if (collects && collects.length > 0 && d.noPersonalData !== undefined) findings.push({ message: "data.noPersonalData says it keeps nothing about anyone, but data.collects lists what it keeps.", file: MANIFEST, fix: "Remove data.noPersonalData." });
  if (findings.length > 0) return result(id, title, "STRUCTURAL", FAIL, "The data section isn't complete.", findings);
  const n = collects.length;
  const s = shared.length;
  return result(id, title, "STRUCTURAL", PASS, n === 0 ? (why ? "It declares that it keeps nothing about anyone, and data.noPersonalData says why, for a person to read." : "It declares that it keeps nothing about anyone.") : `It declares ${n} kind${n === 1 ? "" : "s"} of personal data and ${s} outside service${s === 1 ? "" : "s"}, with export and deletion.`);
}

/** Code in other languages, as a phrase: "Python (api/main.py and 2 more)". */
function otherLanguages(p) {
  const byLang = new Map();
  for (const f of p.otherLanguage) {
    const ext = /\.([a-z]+)$/i.exec(f)[1].toLowerCase();
    const lang = OTHER_LANGUAGE_NAMES[ext] ?? ext;
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(f);
  }
  return [...byLang].map(([lang, files]) => `${lang} (${files[0]}${files.length > 1 ? ` and ${files.length - 1} more` : ""})`).join(", ");
}

/** Rule 1 (CHECKED): only code inside the boundary reaches a store. */
function checkBoundary(p) {
  const id = "boundary";
  const title = "Personal data stays inside the boundary";
  const sources = [...p.code.keys()];
  const others = p.otherLanguage.length > 0 ? ` The tool doesn't read ${otherLanguages(p)}, so a person checks that code.` : "";
  if (sources.length === 0) return result(id, title, "CHECKED", NOT_CHECKED, `No JavaScript or TypeScript found. In rules 0 the tool reads only those, so a person checks this.${others}`);
  const uses = p.storeUses;
  if (uses.length === 0) {
    return others
      ? result(id, title, "CHECKED", NOT_CHECKED, `No database or file-store client found in the JavaScript and TypeScript.${others}`)
      : result(id, title, "CHECKED", PASS, "No database or file-store client found in the code.");
  }
  const raw = p.manifest?.data?.boundary;
  if (!Array.isArray(raw) || raw.length === 0) {
    const first = uses[0];
    return result(id, title, "CHECKED", FAIL, "The code uses a database or a file store, and no boundary is declared.", [
      { message: `${first.what} is used (and ${uses.length - 1} more place${uses.length - 1 === 1 ? "" : "s"}), but data.boundary names no folder.`, file: first.file, line: first.line, fix: 'Put the code that reaches the store in one folder, such as "src/data", and name it in data.boundary.' },
    ]);
  }
  const findings = [];
  const boundary = [];
  for (const entry of raw) {
    const clean = String(entry).trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/\*\*?$/, "").replace(/\/+$/, "");
    if (!clean || clean === "." || clean === "*" || clean.startsWith("/") || clean.split("/").includes("..")) {
      findings.push({ message: `"${quoted(entry)}" isn't a folder inside the project.`, file: MANIFEST, fix: "Name the folders that hold the code reaching the store, not the whole project." });
      continue;
    }
    if (!existsSync(join(p.root, clean))) findings.push({ message: `data.boundary names "${quoted(clean)}", which doesn't exist.`, file: MANIFEST, fix: "Name a folder that exists." });
    boundary.push(clean);
  }
  const inside = (file) => boundary.some((b) => file === b || file.startsWith(`${b}/`));
  if (boundary.length > 0 && sources.length > 1 && sources.every(inside)) {
    findings.push({ message: `data.boundary (${boundary.map(quoted).join(", ")}) holds all of the code, so it keeps nothing apart.`, file: MANIFEST, fix: "Name only the folder whose code reaches the store, such as src/data, and keep the rest outside it." });
  }
  for (const use of uses) {
    if (use.kind === "re-export") {
      if (inside(use.file)) findings.push({ message: `It re-exports ${use.what}, so code outside the boundary can use the client directly.`, file: use.file, line: use.line, fix: "Export functions that do the work, not the client." });
      else findings.push({ message: `${use.what} is re-exported outside the boundary.`, file: use.file, line: use.line, fix: `Move this into ${boundary[0] ?? "the boundary"}, and export functions, not the client.` });
      continue;
    }
    if (inside(use.file)) continue;
    findings.push(
      use.kind === "query"
        ? { message: `${use.what} runs outside the boundary.`, file: use.file, line: use.line, fix: `Move the query into a function in ${boundary[0] ?? "the boundary"}, and call that.` }
        : { message: `${use.what} is used outside the boundary.`, file: use.file, line: use.line, fix: `Move this into ${boundary[0] ?? "the boundary"}, and call it from there.` },
    );
  }
  if (findings.length > 0) return result(id, title, "CHECKED", FAIL, "Code outside the boundary reaches a store.", findings);
  const summary = `Only code in ${boundary.join(", ")} reaches a store (${uses.length} place${uses.length === 1 ? "" : "s"}).`;
  return others ? result(id, title, "CHECKED", NOT_CHECKED, `${summary}${others}`) : result(id, title, "CHECKED", PASS, summary);
}

/** The pattern that recognises a service's name in a "who". */
function whoOf(service) {
  if (service.who) return service.who;
  const first = service.name.split(/[ (,]/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(first, "i");
}

/** Rule 3 (CHECKED): every outside service it uses is named. */
function checkLeave(p) {
  const id = "leave";
  const title = "Every outside service that receives data is named";
  const others = p.otherLanguage.length > 0 ? ` The tool doesn't read ${otherLanguages(p)}, so a person checks that code.` : "";
  if (!p.pkg && p.code.size === 0) return result(id, title, "CHECKED", NOT_CHECKED, `No package.json and no JavaScript or TypeScript. In rules 0 the tool reads only those, so a person checks this.${others}`);
  const used = new Map();
  const note = (service, how, pkg, file, line) => {
    const key = `${service.name}|${pkg ?? how}`;
    if (!used.has(key)) used.set(key, { service, how, pkg, file, line });
  };
  const serviceOfPackage = (name) => SERVICES.find((s) => s.packages.some((e) => matches(e, name)));
  for (const dep of p.deps) {
    const s = serviceOfPackage(dep);
    if (s) note(s, `depends on ${dep}`, dep, "package.json");
  }
  for (const i of p.imports) {
    const pkg = packageOf(i.spec);
    if (!pkg) continue;
    const s = serviceOfPackage(pkg);
    if (s) note(s, `imports ${pkg}`, pkg, i.file, i.line);
  }
  const gateway = SERVICES.find((x) => x.gateway);
  for (const [rel, c] of p.code) {
    const at = lineFinder(c);
    for (const a of addressesIn(c)) {
      const s = SERVICES.find((x) => (x.hosts ?? []).some((h) => hostMatches(a.host, h)));
      if (s) note(s, `calls ${a.host}`, null, rel, at(a.index));
    }
    if (p.imports.some((i) => i.file === rel && i.spec === "ai") && GATEWAY_MODEL.test(c)) note(gateway, "uses the AI SDK with a model named as provider/model", "ai", rel, at(c.search(GATEWAY_MODEL)));
  }
  if (used.size === 0) {
    return others
      ? result(id, title, "CHECKED", NOT_CHECKED, `No outside service the tool knows is used in the JavaScript and TypeScript.${others}`)
      : result(id, title, "CHECKED", PASS, "No outside service the tool knows is used.");
  }
  const shared = Array.isArray(p.manifest?.data?.sharedWith) ? p.manifest.data.sharedWith.filter((s) => s && typeof s === "object") : [];
  const listsPackage = (entry, pkg) => Array.isArray(entry.packages) && entry.packages.some((x) => typeof x === "string" && (matches(x, pkg) || x === pkg));
  const findings = [];
  const named = new Set();
  for (const { service, how, pkg, file, line } of used.values()) {
    const whoMatches = (entry) => service.generic || (typeof entry.who === "string" && whoOf(service).test(entry.who));
    const ok = shared.some((entry) => whoMatches(entry) && (pkg === null || listsPackage(entry, pkg)));
    if (ok) {
      named.add(service.name);
      continue;
    }
    const hint = pkg === null ? `{"who": "${service.name}", "what": "…", "why": "…"}` : `{"who": "${service.generic ? "…" : service.name}", "what": "…", "why": "…", "packages": ["${pkg}"]}`;
    findings.push({ message: `It ${how}, which sends data to ${service.name}, and data.sharedWith doesn't name it.`, file, line, fix: `Add ${hint} to data.sharedWith, or stop using it.` });
  }
  if (findings.length > 0) return result(id, title, "CHECKED", FAIL, "An outside service isn't named.", findings);
  const summary = `Named: ${[...named].join(", ")}.`;
  return others ? result(id, title, "CHECKED", NOT_CHECKED, `${summary}${others}`) : result(id, title, "CHECKED", PASS, summary);
}

/** Rule 4 (CHECKED): no ads, no tracking. */
function checkTracking(p) {
  const id = "tracking";
  const title = "No ads and no tracking";
  const findings = [];
  const seen = new Set();
  const flag = (name, how, file, line) => {
    const key = `${name}|${file}|${line ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ message: `${name} (${how}).`, file, line, fix: "Remove it. Rule 4 allows no ads and no tracking; counting visits without following anyone is allowed, if the service is named in data.sharedWith." });
  };
  for (const dep of p.deps) for (const t of TRACKING) if ((t.packages ?? []).some((e) => matches(e, dep))) flag(t.name, `the package ${dep}`, "package.json");
  for (const i of p.imports) {
    for (const t of TRACKING) {
      if ((t.packages ?? []).some((e) => matches(e, i.spec)) || (t.specifiers ?? []).some((e) => matches(e, i.spec))) flag(t.name, `imports ${i.spec}`, i.file, i.line);
    }
  }
  for (const rel of p.readable) {
    if (!MARKUP.test(rel) || TEST.test(rel)) continue;
    const raw = p.text(rel);
    if (raw === null) continue;
    const text = p.code.get(rel) ?? raw;
    const at = lineFinder(text);
    for (const t of TRACKING) {
      for (const host of t.hosts ?? []) {
        const re = new RegExp(`(?:https?:)?//(?:[a-z0-9-]+\\.)*${host.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "gi");
        for (const m of text.matchAll(re)) flag(t.name, `loads ${host}`, rel, at(m.index));
      }
      for (const call of t.calls ?? []) for (const m of text.matchAll(call)) flag(t.name, "turned on in code", rel, at(m.index));
    }
    for (const m of text.matchAll(NEXT_THIRD_PARTIES_GOOGLE)) {
      const which = GOOGLE_COMPONENTS.exec(m[1])?.[1];
      if (which) flag(which.includes("GTM") || which.includes("TagManager") ? "Google Tag Manager" : "Google Analytics", `imports ${which} from @next/third-parties`, rel, at(m.index));
    }
  }
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, "No ad network, pixel, Google Analytics, Tag Manager, session recording or data hub the tool knows.")
    : result(id, title, "CHECKED", FAIL, "It loads ads or tracking.", findings);
}

/** Rule 8 (CHECKED): no secrets, and no database, in the repository. Prints where, never what. */
function checkSecrets(p) {
  const id = "secrets";
  const title = "No secrets or data in the repository";
  const findings = [];
  const skipped = { large: [], binary: 0, unreadable: [] };
  const scan = (rel, text) => {
    const at = lineFinder(text);
    for (const s of SECRETS) {
      for (const m of text.matchAll(s.re)) {
        if (s.real && !s.real(m, text)) continue;
        findings.push({ message: `${rel} holds what looks like ${s.kind}.`, file: rel, line: at(m.index), fix: "Move it to an environment variable, and replace it: anyone who saw the file has it." });
      }
    }
  };
  let envNotChecked = false;
  for (const rel of p.files) {
    const name = basename(rel);
    if (DATABASE_FILE.test(name)) {
      findings.push({ message: `${rel} is a database file, and git doesn't ignore it.`, file: rel, fix: `People's data can't be in the repository: add ${name} to .gitignore and remove it (git rm --cached ${rel}).` });
      continue;
    }
    if (ENV_FILE.test(name) && !ENV_EXAMPLE.test(name)) {
      if (!p.git) {
        envNotChecked = true;
        continue;
      }
      const text = readText(p.root, rel, skipped);
      if (text === null) continue;
      scan(rel, text);
      const at = lineFinder(text);
      let offset = 0;
      for (const line of text.split("\n")) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        const value = m ? m[2].replace(/^(["'])(.*)\1$/, "$2") : "";
        if (m && SECRET_NAME.test(m[1]) && !PLACEHOLDER_VALUE.test(value)) {
          findings.push({ message: `${rel} sets ${m[1]}, and git doesn't ignore the file.`, file: rel, line: at(offset), fix: `Add ${name} to .gitignore and remove it from the repository (git rm --cached ${rel}). If it was ever pushed, replace the secret.` });
        }
        offset += line.length + 1;
      }
    }
  }
  for (const rel of p.readable) {
    if (DATABASE_FILE.test(basename(rel))) continue;
    const text = p.text(rel) ?? (p.skipped.large.includes(rel) ? readText(p.root, rel, skipped, MAX_SECRET_BYTES) : null);
    if (text === null) continue;
    scan(rel, text);
  }
  const unread = [...new Set([...p.skipped.unreadable, ...skipped.unreadable, ...skipped.large])];
  const notes = [];
  if (envNotChecked) notes.push(p.gitRoot ? " git couldn't run here, so the tool read the folder instead and couldn't tell which files git tracks: environment files weren't checked." : " Not a git repository, so environment files weren't checked.");
  if (unread.length > 0) notes.push(` ${unread.length} file${unread.length === 1 ? "" : "s"} couldn't be read: ${unread.slice(0, 3).join(", ")}${unread.length > 3 ? ", …" : ""}.`);
  if (findings.length > 0) return result(id, title, "CHECKED", FAIL, "It looks like a secret or people's data is in the repository.", findings);
  if (unread.length > 0) return result(id, title, "CHECKED", NOT_CHECKED, `No secret the tool recognises in what it could read.${notes.join("")}`);
  return result(id, title, "CHECKED", PASS, `No secret the tool recognises.${notes.join("")}`);
}

/** Rule 7 (CHECKED): the costs file exists, is the project's own, and states the costs. */
function checkCosts(p) {
  const id = "costs";
  const title = "Its costs are public";
  const path = p.manifest && typeof p.manifest.costs === "string" ? p.manifest.costs.trim().replace(/\\/g, "/").replace(/^\.\//, "") : "";
  if (!path || isTodo(path)) return result(id, title, "CHECKED", FAIL, "No costs file is named.", [{ message: '"costs" names no file.', file: MANIFEST, fix: 'Write "COSTS.md", and fill it in.' }]);
  if (path.startsWith("/") || path.split("/").includes("..")) return result(id, title, "CHECKED", FAIL, "The costs file is outside the project.", [{ message: `"${quoted(path)}" is outside the project.`, file: MANIFEST, fix: "Keep the costs file in the project, where everyone can read it." }]);
  if (!isPlainFile(join(p.root, path)) || !insideProject(p.root, path)) return result(id, title, "CHECKED", FAIL, `${path} doesn't exist.`, [{ message: `our.one.json names ${path}, which doesn't exist in the project.`, file: MANIFEST, fix: `Create ${path}: what it costs to run each month, and who pays.` }]);
  if (p.git && !p.files.includes(path)) return result(id, title, "CHECKED", FAIL, `git ignores ${path}.`, [{ message: `${path} is ignored by git, so nobody else can read it.`, file: MANIFEST, fix: `Keep ${path} in the repository.` }]);
  const text = p.text(path) ?? "";
  const at = lineFinder(text);
  if (text.trim().length < 20) return result(id, title, "CHECKED", FAIL, `${path} is empty.`, [{ message: `${path} says nothing yet.`, file: path, fix: "Write what it costs to run each month, and who pays." }]);
  const ph = text.search(/\b(?:TODO|TBD|TBC|TBA|to be (?:decided|determined|confirmed|announced)|fill (?:this|it|these) in)\b/i);
  if (ph !== -1) return result(id, title, "CHECKED", FAIL, `${path} still says TODO.`, [{ message: `${path} still says TODO, or another placeholder, instead of a cost.`, file: path, line: at(ph), fix: "Write each cost, or ask the person for it." }]);
  let offset = 0;
  for (const line of text.split("\n")) {
    if (/^\s*\|/.test(line) && !/^\s*\|[\s:|-]+$/.test(line) && /\|\s*\|/.test(line)) {
      return result(id, title, "CHECKED", FAIL, `${path} has an empty cell.`, [{ message: `A row of the table in ${path} is empty.`, file: path, line: at(offset), fix: "Fill each cell, or ask the person for it. Write 0 or none where something costs nothing." }]);
    }
    offset += line.length + 1;
  }
  if (!/\d/.test(text) && !/\b(?:nothing|none|free|zero|no cost)\b/i.test(text)) return result(id, title, "CHECKED", FAIL, `${path} states no cost.`, [{ message: `${path} doesn't state any cost.`, file: path, fix: "Write what each thing costs a month, even when it's nothing." }]);
  return result(id, title, "CHECKED", PASS, `${path}.`);
}

/** Rule 9 (CHECKED): no claim of users' ownership, or of our.one's approval. */
function checkClaims(p) {
  const id = "claims";
  const title = "It claims only what is true";
  const claims = p.manifest?.claims && typeof p.manifest.claims === "object" ? p.manifest.claims : {};
  const allowed = Array.isArray(claims.allowed) ? claims.allowed.filter((a) => a && typeof a.file === "string" && typeof a.text === "string") : [];
  const skip = Array.isArray(claims.skip) ? claims.skip.filter((s) => s && typeof s.file === "string") : [];
  const skipped = new Set(skip.map((s) => toPosix(s.file).replace(/^\.\//, "")));
  const used = new Set();
  const findings = [];
  const scan = (rel, original, base, fixedAt) => {
    const { text, at } = normaliseText(base);
    const line = lineFinder(original);
    const spans = [];
    allowed.forEach((a, index) => {
      if (toPosix(a.file).replace(/^\.\//, "") !== rel) return;
      const want = normaliseText(a.text).text;
      if (!want) return;
      for (let i = text.indexOf(want); i !== -1; i = text.indexOf(want, i + 1)) {
        spans.push([i, i + want.length]);
        used.add(index);
      }
    });
    for (const claim of CLAIMS) {
      for (const m of text.matchAll(claim.re)) {
        if (spans.some(([s, e]) => m.index >= s && m.index + m[0].length <= e)) continue;
        if (DENIAL.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
        const where = fixedAt === null ? (at[m.index] ?? 0) : fixedAt;
        findings.push({ message: `"${m[0]}" ${claim.what}.`, file: rel, line: line(where), fix: "Only our.one's records can make that true. Remove it, or, if it's a definition or a denial, list the exact sentence in our.one.json under claims.allowed, with why." });
      }
    }
  };
  const files = p.readable.filter((f) => !TEST.test(f) && f !== MANIFEST && (READ_BY_PEOPLE.test(f) || MESSAGES.test(f) || /^readme(?:\.md)?$/i.test(f)));
  for (const rel of files) {
    if (skipped.has(rel)) continue;
    const original = p.text(rel);
    if (original === null) continue;
    if (/\.json$/i.test(rel)) {
      for (const [value, index] of jsonStrings(original)) scan(rel, original, value, index);
      continue;
    }
    scan(rel, original, p.code.get(rel) ?? original, null);
  }
  // The manifest itself: every string but the sentences it lets through.
  if (p.manifest && typeof p.manifest === "object") {
    const raw = readText(p.root, MANIFEST, { large: [], binary: 0, unreadable: [] }) ?? "";
    const quotations = new Set(allowed.map((a) => a.text));
    for (const [value, index] of jsonStrings(raw)) if (!quotations.has(value)) scan(MANIFEST, raw, value, index);
  }
  allowed.forEach((a, index) => {
    if (!used.has(index)) findings.push({ message: `claims.allowed lists a sentence that isn't in ${quoted(a.file)}.`, file: MANIFEST, fix: "Remove it, or correct the file or the sentence." });
  });
  for (const s of skip) if (!p.files.includes(toPosix(s.file).replace(/^\.\//, ""))) findings.push({ message: `claims.skip names ${quoted(s.file)}, which isn't in the project.`, file: MANIFEST, fix: "Remove it." });
  if (findings.length > 0) return result(id, title, "CHECKED", FAIL, "It claims something only our.one's records can make true.", findings);
  const notes = [];
  if (allowed.length > 0) notes.push(`${allowed.length} sentence${allowed.length === 1 ? "" : "s"} listed in claims.allowed`);
  if (skip.length > 0) notes.push(`${skip.length} file${skip.length === 1 ? "" : "s"} skipped by claims.skip`);
  return result(id, title, "CHECKED", PASS, notes.length === 0 ? "No claim of users' ownership or of our.one's approval." : `No claim, beyond ${notes.join(" and ")}, for a person to read.`);
}

/** Every string value in a JSON document, with where it starts. */
function jsonStrings(raw) {
  const out = [];
  for (const m of raw.matchAll(/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/g)) {
    try {
      out.push([JSON.parse(m[0]), m.index]);
    } catch {
      // Not a string after all.
    }
  }
  return out;
}

/**
 * The words as a reader sees them: tags dropped, JSX's {" "} read as a
 * space, the common entities decoded, whitespace as one space; each
 * character keeps its place in the original.
 */
function normaliseText(original) {
  const entities = { "&nbsp;": " ", "&apos;": "'", "&#39;": "'", "&rsquo;": "'", "&quot;": '"', "&amp;": "&", "&#x27;": "'" };
  let text = "";
  const at = [];
  let i = 0;
  const space = (from) => {
    if (text.length > 0 && text[text.length - 1] !== " ") {
      text += " ";
      at.push(from);
    }
  };
  while (i < original.length) {
    const ch = original[i];
    if (ch === "<" && /[A-Za-z/]/.test(original[i + 1] ?? "")) {
      const close = original.indexOf(">", i);
      const reopen = original.indexOf("<", i + 1);
      if (close !== -1 && close - i < 500 && (reopen === -1 || reopen > close)) {
        i = close + 1;
        continue;
      }
    }
    if (ch === "{") {
      const m = /^\{\s*(["'])(\s*)\1\s*\}/.exec(original.slice(i, i + 12));
      if (m) {
        space(i);
        i += m[0].length;
        continue;
      }
    }
    if (/\s/.test(ch)) {
      const start = i;
      while (i < original.length && /\s/.test(original[i])) i += 1;
      space(start);
      continue;
    }
    if (ch === "&") {
      const entity = Object.keys(entities).find((e) => original.startsWith(e, i));
      if (entity) {
        text += entities[entity];
        at.push(i);
        i += entity.length;
        continue;
      }
    }
    text += ch === "’" ? "'" : ch;
    at.push(i);
    i += 1;
  }
  return { text, at };
}

/** A secret in any message, summary or fix is replaced before anything is printed. */
function redact(value) {
  let out = value;
  for (const s of SECRETS) out = out.replace(s.re, "[a secret, not shown]");
  return out;
}

/** The proposal: written, still a template, or missing. */
function pitchState(p) {
  const file = p.files.find((f) => f.toLowerCase() === "pitch.md");
  if (!file) return "missing";
  const text = p.text(file) ?? "";
  return /\bTODO\b/.test(text) ? "todo" : "written";
}

/** Every check, in the report's order (D-0019 §C). */
export function check(root) {
  const p = loadProject(root);
  const checks = [checkManifest, checkLicence, checkAgents, checkData, checkBoundary, checkLeave, checkTracking, checkSecrets, checkCosts, checkClaims].map((c) => {
    const r = c(p);
    return {
      ...r,
      summary: redact(r.summary),
      findings: r.findings.map((f) => ({ ...f, message: redact(f.message), ...(f.fix ? { fix: redact(f.fix) } : {}) })),
    };
  });
  const failed = checks.filter((c) => c.outcome === FAIL);
  return {
    tool: "our-one",
    version: VERSION,
    rules: RULES_VERSION,
    sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    project: basename(root),
    result: failed.length === 0 ? "ready" : "not-ready",
    pitch: pitchState(p),
    code: p.code.size > 0 || p.otherLanguage.length > 0,
    checks,
    forAPerson: FOR_A_PERSON,
    notBuilt: NOT_BUILT,
    skipped: { large: p.skipped.large, binary: p.skipped.binary, unreadable: p.skipped.unreadable },
  };
}

/* ------------------------------------------------------------ the report */

const MARK = { [PASS]: "  ok  ", [FAIL]: " FAIL ", [NOT_CHECKED]: " n/a  " };

function wrap(text, width, indent) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line.length > 0 && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line.length === 0 ? word : `${line} ${word}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

/** "· text", with the lines after the first under the text. */
function bullet(text) {
  const lines = wrap(text, 64, "").split("\n");
  return lines.map((l, i) => (i === 0 ? `    · ${l}` : `      ${l}`)).join("\n");
}

function where(f) {
  return f.file ? `${f.file}${f.line ? `:${f.line}` : ""}: ` : "";
}

export function formatReport(r) {
  const out = [];
  const rule = "  " + "-".repeat(70);
  out.push("", `  our.one check ${r.version} · rules ${r.rules} · project ${r.project}`, `  tool sha256 ${r.sha256}`, rule);
  for (const c of r.checks) {
    out.push(`  [${MARK[c.outcome]}] ${c.id.padEnd(9)} ${c.title}  (${c.class})`);
    out.push(wrap(c.summary, 58, "             "));
    for (const f of c.findings.slice(0, 12)) {
      out.push(wrap(`${where(f)}${f.message}`, 56, "               "));
      if (f.fix) out.push(wrap(`Fix: ${f.fix}`, 54, "                 "));
    }
    if (c.findings.length > 12) out.push(`               …and ${c.findings.length - 12} more (--json lists them all).`);
    out.push("");
  }
  out.push(rule, "  For a person, when it's proposed. No machine can decide these:");
  for (const q of r.forAPerson) out.push(bullet(q));
  out.push("", "  Not built yet. For a protected service, our.one would provide these:");
  for (const q of r.notBuilt) out.push(bullet(q));
  if (r.skipped.large.length > 0) out.push("", wrap(`Not read for code, over 1 MB: ${r.skipped.large.join(", ")}.`, 66, "  "));
  out.push(rule);
  out.push(wrap("There is no score on purpose. What passed is what a machine can see in the files; what it can't see is listed above, at the same weight.", 68, "  "), "");
  const failed = r.checks.filter((c) => c.outcome === FAIL);
  const notChecked = r.checks.filter((c) => c.outcome === NOT_CHECKED);
  if (failed.length > 0) {
    out.push(`  RESULT: NOT READY. ${failed.length} check${failed.length === 1 ? " fails" : "s fail"}:`);
    out.push(wrap(`${failed.map((c) => c.id).join(", ")}. Fix ${failed.length === 1 ? "it" : "them"} and run the check again.`, 60, "          "));
  } else {
    out.push(`  RESULT: READY TO PROPOSE${notChecked.length > 0 ? `, with ${notChecked.length} check${notChecked.length === 1 ? "" : "s"} not run (${notChecked.map((c) => c.id).join(", ")})` : ""}.`);
    out.push(wrap("That's all passing means. It isn't listed, approved or protected: a person reads the open items, and the people who would use it decide.", 60, "          "));
    if (!r.code) out.push(wrap("There is no code here yet, so the checks had little to read.", 60, "          "));
    if (r.pitch !== "written") out.push(wrap(r.pitch === "missing" ? "Before you propose: there is no PITCH.md yet. Write it with the person." : "Before you propose: PITCH.md still says TODO. Fill it in with the person.", 60, "          "));
  }
  out.push("");
  return out.join("\n");
}

/** For a stop hook: short, and only what fails. */
function formatHook(r) {
  const failed = r.checks.filter((c) => c.outcome === FAIL);
  const lines = [`our.one check: ${failed.length} check${failed.length === 1 ? " fails" : "s fail"} (rules ${r.rules}).`];
  for (const c of failed) {
    for (const f of c.findings.slice(0, 5)) lines.push(`- ${c.id}: ${where(f)}${f.message}${f.fix ? ` Fix: ${f.fix}` : ""}`);
    if (c.findings.length > 5) lines.push(`- ${c.id}: …and ${c.findings.length - 5} more.`);
  }
  lines.push("If something only the person can tell you is missing (a name, a contact, the costs, the licence), ask them, and never invent it.");
  lines.push(`Fix the rest, and run node ${DEFAULT_TOOL_PATH} check until it passes. Don't change the check or the rules block to make it pass.`);
  return lines.join("\n");
}

/* ------------------------------------------------------------ init */

const COSTS_TEMPLATE = `# Costs

What it costs to run this project each month, and who pays. Keep it up to date (our.one rule 7).

| What | Provider | A month | Paid by |
|---|---|---|---|
| Hosting | TODO | TODO | TODO |
| Database | TODO | TODO | TODO |
| Email | TODO | TODO | TODO |
| Domain | TODO | TODO | TODO |

The maintainer's pay: TODO (write "none" if there is none).
`;

const PITCH_TEMPLATE = `# Proposal: TODO the project's name

A proposal to our.one, with the parts the common agreement asks every
proposal for (D-0017 §G): https://our.one/agreement. Send it by email when
proposals open; the address is on https://our.one/maintainers.

## The need

Who has it, and what they use or pay for today.

## What it offers

What using it is like, in a few sentences.

## What people would have to change

What they would move, learn or give up to use it.

## Price, scope and budget

What it would cost the people who choose it, what is in and out of scope,
and the monthly budget, with the maintainer's pay.

## What you're asking for now

Feedback, people to try it, or people who would pay.

## What has to happen first

What has to happen before it runs for real (for example, enough people
saying they'd pay), and what happens if it doesn't.

## The check

The RESULT line and the tool's sha256 line from
\`node scripts/our-one.mjs check\`, and the commit it ran on. Commit this
file afterwards: our.one checks the commit you name.
`;

function hookCommand(toolPath) {
  return `node "\${CLAUDE_PROJECT_DIR}/${toolPath}" check --hook`;
}

function workflow(toolPath) {
  return `# The our.one check, on every push and pull request (our.one rule 10).
name: our.one check
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: node ${toolPath} check
`;
}

function gitRemote(root) {
  try {
    const url = execFileSync("git", ["-c", "core.fsmonitor=false", "remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(url);
    if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
    const https = /^https:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
    if (https) return `https://${https[1]}/${https[2]}`;
  } catch {
    // No git, or no remote: the field stays TODO.
  }
  return null;
}

function manifestTemplate(root) {
  let license = "TODO: the SPDX id of its open-source licence, such as Apache-2.0";
  if (isPlainFile(join(root, "package.json")) && insideProject(root, "package.json")) {
    try {
      const pkg = JSON.parse(withoutBom(readFileSync(join(root, "package.json"), "utf8")));
      const known = Object.keys(LICENCES).find((k) => k.toLowerCase() === String(pkg.license ?? "").toLowerCase());
      if (known) license = known;
    } catch {
      // A package.json that doesn't parse: the field stays TODO.
    }
  }
  return {
    $schema: SCHEMA_URL,
    rules: RULES_VERSION,
    name: "TODO: the project's name",
    purpose: "TODO: one sentence on what it does for the people who use it",
    maintainers: [{ name: "TODO: your name", contact: "TODO: an email address or an https:// link" }],
    source: gitRemote(root) ?? "TODO: the https:// address of its public repository",
    license,
    costs: "COSTS.md",
    data: {
      collects: [{ what: "TODO: one kind of personal data it keeps (add one entry for each)", why: "TODO: why the service needs it", kept: "TODO: for how long" }],
      sharedWith: [],
      boundary: [],
      export: "TODO: how a person downloads their data",
      delete: "TODO: how a person deletes their data",
    },
  };
}

/** Create a file only if it doesn't exist, and only inside the project; a failure is noted, not thrown. */
function create(root, rel, content, report) {
  const path = join(root, rel);
  if (existsSync(path) || isLink(path)) {
    report.kept.push(rel);
    return false;
  }
  if (!writable(root, rel)) {
    report.notes.push(`${rel} would be written outside the project, through a link, so it wasn't created.`);
    return false;
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: "wx" });
  } catch (error) {
    report.notes.push(`${rel} couldn't be created (${error && error.code ? error.code : "an error"}), so it was left out.`);
    return false;
  }
  report.created.push(rel);
  return true;
}

/** The rules block put back: one block, word for word, where the first was; the rest of AGENTS.md is kept. */
function withRulesBlock(current) {
  const re = /<!-- our\.one rules [\w.-]+: begin[\s\S]*?<!-- our\.one rules [\w.-]+: end -->/g;
  let first = true;
  const replaced = current.replace(re, () => {
    if (!first) return "";
    first = false;
    return RULES_BLOCK;
  });
  return first ? `${current.replace(/\s*$/, "")}\n\n${RULES_BLOCK}\n` : replaced.replace(/\n{3,}/g, "\n\n");
}

export function init(root) {
  const report = { created: [], updated: [], kept: [], notes: [] };
  const self = selfInside(root);
  const toolPath = self ?? DEFAULT_TOOL_PATH;
  if (!self) report.notes.push(`The tool isn't inside this project. Put it at ${DEFAULT_TOOL_PATH}: the hook and the workflow run it from there.`);
  else if (self !== DEFAULT_TOOL_PATH) report.notes.push(`The tool is at ${self}. The rules block names ${DEFAULT_TOOL_PATH}; moving it there keeps them in step.`);

  create(root, MANIFEST, `${JSON.stringify(manifestTemplate(root), null, 2)}\n`, report);

  // AGENTS.md: the rules block, put back word for word; the rest is kept.
  const agentsPath = join(root, "AGENTS.md");
  if (!writable(root, "AGENTS.md")) {
    report.notes.push("AGENTS.md is a link, or a second name for a file elsewhere, so it was left alone. Put the rules block in the project's own AGENTS.md.");
  } else if (!existsSync(agentsPath)) {
    create(root, "AGENTS.md", `# AGENTS.md\n\nInstructions for any coding agent working on this project.\n\n${RULES_BLOCK}\n`, report);
  } else {
    try {
      const current = readFileSync(agentsPath, "utf8");
      const next = withRulesBlock(current);
      if (next !== current) {
        writeFileSync(agentsPath, next);
        report.updated.push("AGENTS.md (the rules block)");
      } else {
        report.kept.push("AGENTS.md");
      }
    } catch (error) {
      report.notes.push(`AGENTS.md couldn't be updated (${error && error.code ? error.code : "an error"}).`);
    }
  }

  // CLAUDE.md imports AGENTS.md, so Claude Code reads the rules too. One that exists is left as it is.
  const claudePath = join(root, "CLAUDE.md");
  if (!writable(root, "CLAUDE.md")) {
    report.notes.push("CLAUDE.md is a link, so it was left alone. Add a line @AGENTS.md to the project's own CLAUDE.md.");
  } else if (!existsSync(claudePath)) {
    create(root, "CLAUDE.md", "@AGENTS.md\n", report);
  } else {
    report.kept.push("CLAUDE.md");
    let text = "";
    try {
      text = readFileSync(claudePath, "utf8");
    } catch {
      text = "";
    }
    if (!/^@AGENTS\.md\s*$/m.test(text)) report.notes.push("CLAUDE.md doesn't import AGENTS.md. Add a line @AGENTS.md to it, so Claude Code reads the rules.");
  }

  create(root, "COSTS.md", COSTS_TEMPLATE, report);
  create(root, "PITCH.md", PITCH_TEMPLATE, report);

  // The stop hook: Claude Code runs the check each time the agent stops.
  const hook = { type: "command", command: hookCommand(toolPath) };
  const settingsRel = ".claude/settings.json";
  const settingsPath = join(root, settingsRel);
  if (!existsSync(settingsPath) && !isLink(settingsPath)) {
    create(root, settingsRel, `${JSON.stringify({ hooks: { Stop: [{ hooks: [hook] }] } }, null, 2)}\n`, report);
  } else if (!writable(root, settingsRel)) {
    report.notes.push(`${settingsRel} is a link, a second name for a file elsewhere, or in a folder that leads outside the project, so it was left alone. Add a Stop hook that runs: ${hook.command}`);
  } else {
    let settings = null;
    try {
      settings = JSON.parse(withoutBom(readFileSync(settingsPath, "utf8")));
    } catch {
      settings = null;
    }
    const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
    if (!plain(settings)) {
      report.notes.push(`${settingsRel} isn't valid JSON, so it was left alone. Add a Stop hook that runs: ${hook.command}`);
      report.kept.push(settingsRel);
    } else if (settings.hooks !== undefined && !plain(settings.hooks)) {
      report.notes.push(`${settingsRel} writes "hooks" in a shape the tool doesn't know, so it was left alone. Add a Stop hook that runs: ${hook.command}`);
      report.kept.push(settingsRel);
    } else if (settings.hooks && settings.hooks.Stop !== undefined && !Array.isArray(settings.hooks.Stop)) {
      report.notes.push(`${settingsRel} writes its Stop hooks in a shape the tool doesn't know, so it was left alone. Add a Stop hook that runs: ${hook.command}`);
      report.kept.push(settingsRel);
    } else {
      const hooks = settings.hooks ?? {};
      const stop = hooks.Stop ?? [];
      if (JSON.stringify(stop).includes("our-one.mjs")) {
        report.kept.push(settingsRel);
      } else {
        settings.hooks = { ...hooks, Stop: [...stop, { hooks: [hook] }] };
        try {
          writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
          report.updated.push(`${settingsRel} (the stop hook)`);
        } catch (error) {
          report.notes.push(`${settingsRel} couldn't be updated (${error && error.code ? error.code : "an error"}).`);
        }
      }
    }
  }

  // The workflow: GitHub runs only the workflows at the repository's root.
  const gitRoot = gitRootOf(root);
  let realRoot = root;
  let realGit = gitRoot;
  try {
    realRoot = realpathSync(root);
    if (gitRoot) realGit = realpathSync(gitRoot);
  } catch {
    // Keep the paths as given.
  }
  if (realGit && realGit !== realRoot) {
    const rel = toPosix(relative(realGit, realRoot));
    report.notes.push(`This project is a folder (${rel}) inside a larger repository, and GitHub runs only the workflows at the repository's root. Add .github/workflows/our-one.yml there, with "working-directory: ${rel}" on the check's step, which runs: node ${toolPath} check. Claude Code reads .claude/settings.json from the folder it starts in: start it in ${rel}, or add the stop hook to the root's settings with --project ${rel}.`);
  } else {
    create(root, ".github/workflows/our-one.yml", workflow(toolPath), report);
  }

  if (licenceFilesAt(root).length === 0 && !(gitRoot && gitRoot !== root && licenceFilesAt(gitRoot).length > 0)) {
    report.notes.push("There is no licence file. Ask the person which open-source licence to use (Apache-2.0 is the feed's), and add its full text as LICENSE.");
  }
  return report;
}

function formatInit(r) {
  const out = ["", `  our.one init ${VERSION} · rules ${RULES_VERSION}`, ""];
  if (r.created.length) out.push("  Created:", ...r.created.map((f) => `    ${f}`), "");
  if (r.updated.length) out.push("  Updated:", ...r.updated.map((f) => `    ${f}`), "");
  if (r.kept.length) out.push("  Already there, left as they are:", ...r.kept.map((f) => `    ${f}`), "");
  for (const n of r.notes) out.push(wrap(n, 68, "  "), "");
  out.push(wrap(`Next: fill in every TODO in our.one.json and COSTS.md with the person's answers, build, and run the check before you finish: node ${DEFAULT_TOOL_PATH} check`, 68, "  "), "");
  return out.join("\n");
}

/* ------------------------------------------------------------ main */

const USAGE = `our-one.mjs ${VERSION}, rules ${RULES_VERSION}

  node scripts/our-one.mjs init     set this project up for our.one
  node scripts/our-one.mjs check    check it against the rules
  node scripts/our-one.mjs rules    print the rules block

Options:
  --project <dir>   the project's folder (default: the folder that holds
                    scripts/, when the tool is in scripts/; otherwise here)
  --json            check: print the result as JSON
  --hook            check: run as a Claude Code stop hook
  --version         print the version and the tool's SHA-256

It makes no network request. init writes only the files it names.
Instructions for coding agents: https://our.one/build.md
`;

/** The project's folder: --project; or, when the tool is in a folder called scripts, the folder that holds it; or here. */
function projectRoot(flag) {
  if (flag) return resolve(flag);
  const self = fileURLToPath(import.meta.url);
  if (basename(dirname(self)) === "scripts") return dirname(dirname(self));
  return process.cwd();
}

/** The stop hook's input, read to its end; nothing when standard input is a terminal. */
function readHookInput() {
  try {
    if (fstatSync(0).isCharacterDevice()) return {};
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(0, "utf8") || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function realOrSame(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function main(argv) {
  const args = [...argv];
  const flags = { json: false, hook: false, project: null, version: false, help: false };
  const positional = [];
  while (args.length > 0) {
    const a = args.shift();
    if (a === "--json") flags.json = true;
    else if (a === "--hook") flags.hook = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--project") {
      const dir = args.shift();
      if (!dir) {
        process.stderr.write("--project needs a folder.\n");
        return 2;
      }
      flags.project = dir;
    } else if (a.startsWith("--")) {
      process.stderr.write(`Unknown option ${a}.\n\n${USAGE}`);
      return 2;
    } else positional.push(a);
  }
  if (flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`${VERSION} rules ${RULES_VERSION} sha256 ${sha256(readFileSync(fileURLToPath(import.meta.url)))}\n`);
    return 0;
  }
  const command = positional[0] ?? "check";
  if (positional.length > 1 || !["init", "check", "rules"].includes(command)) {
    process.stderr.write(`Unknown command "${positional.join(" ")}".\n\n${USAGE}`);
    return 2;
  }
  if (command === "rules") {
    process.stdout.write(`${RULES_BLOCK}\n`);
    return 0;
  }
  const root = projectRoot(flags.project);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    process.stderr.write(`${root} isn't a folder.\n`);
    return 2;
  }
  const real = realOrSame(root);
  if (real === parse(real).root || real === realOrSame(homedir())) {
    process.stderr.write(`Refusing to ${command === "init" ? "set up" : "check"} ${root}: run it inside the project's own folder.\n`);
    return 2;
  }
  if (command === "init") {
    process.stdout.write(formatInit(init(root)));
    return 0;
  }
  if (flags.hook) {
    let r;
    try {
      r = check(root);
    } catch (error) {
      // The check's own failure never holds the agent back.
      process.stdout.write(`${JSON.stringify({ systemMessage: `our.one check couldn't run: ${error instanceof Error ? error.message : String(error)}` })}\n`);
      return 0;
    }
    if (r.result === "ready") return 0;
    const input = readHookInput();
    if (input.stop_hook_active === true) {
      // Sent back once already: let the agent stop, and tell the person.
      const failed = r.checks.filter((c) => c.outcome === FAIL).map((c) => c.id);
      process.stdout.write(`${JSON.stringify({ systemMessage: `our.one check still fails: ${failed.join(", ")}. Run: node ${DEFAULT_TOOL_PATH} check` })}\n`);
      return 0;
    }
    process.stderr.write(`${formatHook(r)}\n`);
    return 2;
  }
  const r = check(root);
  if (flags.json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else process.stdout.write(formatReport(r));
  return r.result === "ready" ? 0 : 1;
}

/** Run only when started as a program, by any path to this file, links included. */
function startedAsProgram() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsProgram()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`our-one.mjs failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
