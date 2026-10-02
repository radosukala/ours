#!/usr/bin/env node
/**
 * our-one.mjs: the our.one build kit's tool. Version 0.1.0, rules 0.
 *
 *   node scripts/our-one.mjs init     set this project up for our.one
 *   node scripts/our-one.mjs check    check it against the rules
 *   node scripts/our-one.mjs rules    print the rules block
 *
 * One file, no dependencies, Node 18 or later. It reads the project's
 * files and runs `git ls-files` (and, during init, `git remote get-url`)
 * to list them. It makes no network request. `init` writes only the files
 * it names, and never overwrites one, except the rules block in AGENTS.md,
 * which it puts back word for word, and the stop hook it adds to
 * .claude/settings.json. When it finds a secret, it prints the file, the
 * line and the kind of secret, never the secret.
 *
 * What it checks is decided by our.one's records (D-0019 §C), not by this
 * file: a change to the rules is a new rules version, by a new decision.
 * Each check says how it is held. Most are CHECKED: a pattern that a
 * determined person can get around, and that cannot see what code does
 * when it runs. So every run also lists what a person must read, and the
 * safeguards our.one has not built.
 *
 * Passing makes a project ready to propose to our.one. Nothing more: it is
 * not listed, approved or protected by passing.
 *
 * Source: https://github.com/radosukala/ours/tree/main/kit
 * Licence: Apache-2.0
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const VERSION = "0.1.0";
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
  "This project is being built to be proposed to our.one. These rules come from the common agreement (https://our.one/agreement), which is still a draft. They bind every person and every coding agent working on this code. If a task would break one, stop and say which.",
  "",
  "1. **Keep personal data inside the boundary.** Only code in the folders `our.one.json` names in `data.boundary` may use a database or a file store, or the libraries that reach one.",
  "2. **Declare before you collect.** Before code keeps a new kind of personal data, add it to `data.collects`: what it is, why the service needs it, and how long it is kept.",
  "3. **Name every service that receives data.** Before code sends anything about a person to an outside service, add the service to `data.sharedWith`: who, what and why.",
  "4. **No ads and no tracking.** No ad networks or pixels, no Google Analytics or Tag Manager, no session recording, no data brokers or data hubs.",
  "5. **Nothing is sold.** Build nothing that sells, rents or trades people's data, or the project.",
  "6. **People can leave.** Keep export and deletion working for everything in `data.collects`.",
  "7. **Costs are public.** Keep the costs file `our.one.json` names up to date.",
  "8. **No secrets in the code.** Keys and passwords live in the environment, never in a file the repository tracks.",
  "9. **Say only what is true.** Until our.one's records say otherwise, the project is its maintainer's. Don't present it as its users' property, or as approved, listed or protected by our.one.",
  "10. **Run the check before you finish:** `node scripts/our-one.mjs check`. Fix every FAIL. Never change the check, or this block, to make it pass.",
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
 * "pg-promise").
 */
export const STORES = [
  "pg", "pg-promise", "postgres", "@neondatabase/serverless", "@vercel/postgres", "@planetscale/database",
  "mysql", "mysql2", "mariadb", "sqlite3", "better-sqlite3", "sqlite", "@libsql/client", "libsql",
  "tedious", "mssql", "oracledb", "knex", "kysely", "drizzle-orm", "@prisma/client", "typeorm",
  "sequelize", "@mikro-orm/", "objection", "mongodb", "mongoose", "redis", "@redis/client", "ioredis",
  "@upstash/redis", "@vercel/kv", "firebase/firestore", "firebase/database", "firebase/storage",
  "firebase-admin", "@google-cloud/firestore", "@google-cloud/storage", "@aws-sdk/client-dynamodb",
  "@aws-sdk/lib-dynamodb", "dynamoose", "@aws-sdk/client-s3", "@aws-sdk/lib-storage", "@azure/storage-blob",
  "@azure/cosmos", "@vercel/blob", "cassandra-driver", "neo4j-driver", "couchbase", "nano", "@supabase/",
  "pocketbase", "@instantdb/", "faunadb", "@electric-sql/",
];

/** Code that reaches a store without importing a package by name (a generated Prisma client). */
const STORE_CALLS = [{ name: "PrismaClient", re: /\bnew\s+PrismaClient\s*\(/g }];

/**
 * Outside services that receive data, by package. Rule 3: each one the
 * project uses is named in data.sharedWith, with its packages listed.
 */
export const SERVICES = [
  { name: "Resend", packages: ["resend"] },
  { name: "SendGrid", packages: ["@sendgrid/"] },
  { name: "Postmark", packages: ["postmark"] },
  { name: "Mailgun", packages: ["mailgun.js", "mailgun-js"] },
  { name: "Mailchimp", packages: ["@mailchimp/"] },
  { name: "Amazon SES", packages: ["@aws-sdk/client-ses", "@aws-sdk/client-sesv2"] },
  { name: "an email server (SMTP)", packages: ["nodemailer"] },
  { name: "Twilio", packages: ["twilio"] },
  { name: "Vonage", packages: ["@vonage/"] },
  { name: "Stripe", packages: ["stripe", "@stripe/"] },
  { name: "Paddle", packages: ["@paddle/"] },
  { name: "Lemon Squeezy", packages: ["@lemonsqueezy/"] },
  { name: "PayPal", packages: ["@paypal/"] },
  { name: "OpenAI", packages: ["openai", "@ai-sdk/openai", "@langchain/openai"] },
  { name: "Anthropic", packages: ["@anthropic-ai/sdk", "@ai-sdk/anthropic", "@langchain/anthropic"] },
  { name: "Google AI", packages: ["@google/generative-ai", "@google/genai", "@ai-sdk/google", "@langchain/google-genai"] },
  { name: "Mistral", packages: ["@mistralai/mistralai", "@ai-sdk/mistral"] },
  { name: "Cohere", packages: ["cohere-ai"] },
  { name: "Groq", packages: ["groq-sdk", "@ai-sdk/groq"] },
  { name: "Replicate", packages: ["replicate"] },
  { name: "Hugging Face", packages: ["@huggingface/inference"] },
  { name: "ElevenLabs", packages: ["elevenlabs", "@elevenlabs/"] },
  { name: "Sentry", packages: ["@sentry/"] },
  { name: "Bugsnag", packages: ["@bugsnag/"] },
  { name: "Datadog", packages: ["@datadog/", "dd-trace"] },
  { name: "Rollbar", packages: ["rollbar"] },
  { name: "Honeybadger", packages: ["@honeybadger-io/"] },
  { name: "New Relic", packages: ["newrelic"] },
  { name: "Axiom", packages: ["@axiomhq/"] },
  { name: "Better Stack", packages: ["@logtail/"] },
  { name: "Mixpanel", packages: ["mixpanel", "mixpanel-browser"] },
  { name: "Amplitude", packages: ["@amplitude/", "amplitude-js"] },
  { name: "Heap", packages: ["@heap/", "heap-api"] },
  { name: "PostHog", packages: ["posthog-js", "posthog-node"] },
  { name: "Plausible", packages: ["plausible-tracker", "next-plausible"] },
  { name: "Fathom", packages: ["fathom-client"] },
  { name: "Vercel Web Analytics", packages: ["@vercel/analytics"] },
  { name: "Vercel Speed Insights", packages: ["@vercel/speed-insights"] },
  { name: "Clerk", packages: ["@clerk/"] },
  { name: "Auth0", packages: ["@auth0/"] },
  { name: "Kinde", packages: ["@kinde-oss/"] },
  { name: "WorkOS", packages: ["@workos-inc/"] },
  { name: "Firebase (Google)", packages: ["firebase", "firebase-admin"] },
  { name: "Supabase", packages: ["@supabase/"] },
  { name: "Neon", packages: ["@neondatabase/serverless"] },
  { name: "Vercel Postgres", packages: ["@vercel/postgres"] },
  { name: "Vercel KV", packages: ["@vercel/kv"] },
  { name: "Vercel Blob", packages: ["@vercel/blob"] },
  { name: "PlanetScale", packages: ["@planetscale/database"] },
  { name: "Upstash", packages: ["@upstash/"] },
  { name: "Amazon S3", packages: ["@aws-sdk/client-s3", "@aws-sdk/lib-storage", "@aws-sdk/s3-request-presigner"] },
  { name: "Google Cloud Storage", packages: ["@google-cloud/storage"] },
  { name: "Azure Blob Storage", packages: ["@azure/storage-blob"] },
  { name: "Cloudinary", packages: ["cloudinary", "next-cloudinary"] },
  { name: "UploadThing", packages: ["uploadthing", "@uploadthing/"] },
  { name: "Uploadcare", packages: ["@uploadcare/"] },
  { name: "Algolia", packages: ["algoliasearch", "@algolia/"] },
  { name: "Pusher", packages: ["pusher", "pusher-js"] },
  { name: "Ably", packages: ["ably"] },
  { name: "OneSignal", packages: ["@onesignal/", "onesignal-node"] },
  { name: "Google Maps", packages: ["@googlemaps/", "@react-google-maps/api"] },
  { name: "Mapbox", packages: ["mapbox-gl", "@mapbox/"] },
  { name: "Intercom", packages: ["@intercom/", "react-use-intercom"] },
  { name: "Crisp", packages: ["crisp-sdk-web"] },
];

/**
 * Rule 4: ads, Google Analytics and Tag Manager, session recording, and
 * data brokers and hubs. Found by package, by import, by the address of a
 * script, or by a call. A script address counts only written as an address
 * ("//host…"), so a sentence naming the company doesn't.
 */
export const TRACKING = [
  { name: "the Meta Pixel", packages: ["react-facebook-pixel"], hosts: ["connect.facebook.net"] },
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
    packages: ["react-ga", "react-ga4", "ga-4-react", "vue-gtag", "vue-gtag-next", "ngx-google-analytics", "@analytics/google-analytics", "universal-analytics", "nextjs-google-analytics", "@react-native-firebase/analytics"],
    specifiers: ["firebase/analytics"],
    hosts: ["google-analytics.com", "googletagmanager.com/gtag"],
  },
  { name: "Google Tag Manager", packages: ["react-gtm-module", "@analytics/google-tag-manager"], hosts: ["googletagmanager.com"] },
  { name: "Hotjar", packages: ["@hotjar/browser", "react-hotjar"], hosts: ["static.hotjar.com", "script.hotjar.com"] },
  { name: "FullStory", packages: ["@fullstory/", "react-fullstory"], hosts: ["edge.fullstory.com", "fullstory.com/s/fs.js"] },
  { name: "LogRocket", packages: ["logrocket", "logrocket-react"], hosts: ["cdn.logrocket.io", "cdn.lr-ingest.io"] },
  { name: "Microsoft Clarity", packages: ["@microsoft/clarity", "react-microsoft-clarity"], hosts: ["clarity.ms"] },
  { name: "Smartlook", packages: ["smartlook-client"], hosts: ["web-sdk.smartlook.com"] },
  { name: "Mouseflow", hosts: ["cdn.mouseflow.com"] },
  { name: "Sentry's session replay", packages: ["@sentry/replay", "@sentry-internal/replay"], calls: [/\breplayIntegration\s*\(/g, /\bnew\s+(?:Sentry\.)?Replay\s*\(/g] },
  { name: "Segment", packages: ["@segment/", "analytics-node"], hosts: ["cdn.segment.com"] },
  { name: "RudderStack", packages: ["@rudderstack/"], hosts: ["cdn.rudderlabs.com"] },
  { name: "mParticle", packages: ["@mparticle/"] },
  { name: "Tealium", packages: ["@tealium/"], hosts: ["tags.tiqcdn.com"] },
];

/** @next/third-parties ships Google Analytics and Tag Manager as components. */
const NEXT_THIRD_PARTIES_GOOGLE = /\bimport\s*\{([^}]*)\}\s*from\s*["']@next\/third-parties\/google["']/g;
const GOOGLE_COMPONENTS = /\b(GoogleAnalytics|GoogleTagManager|sendGAEvent|sendGTMEvent)\b/;

/**
 * Rule 8: secrets the tool can recognise. A finding names the file, the
 * line and the kind, never the secret.
 */
export const SECRETS = [
  { kind: "a private key", re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  // AWS's own documentation uses AKIAIOSFODNN7EXAMPLE; a key ending in EXAMPLE isn't one.
  { kind: "an AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, real: (m) => !m[0].endsWith("EXAMPLE") },
  { kind: "a GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { kind: "a Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "a live Stripe key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/g },
  { kind: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "an OpenAI API key", re: /\bsk-[A-Za-z0-9_-]*T3BlbkFJ[A-Za-z0-9_-]{8,}/g },
  { kind: "a SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}/g },
  {
    kind: "a database address with a password",
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s:@/"'`]+:([^\s@/"'`]+)@([^\s/:"'`?#]+)/g,
    real: (m) => !isPlaceholderPassword(m[1]) && !isLocalHost(m[2]),
  },
];

/** Environment files that are examples, not secrets. */
const ENV_EXAMPLE = /^\.env\.(?:example|sample|template|dist|defaults)$/i;
const ENV_FILE = /^\.env(?:\..+)?$/i;

function isPlaceholderPassword(password) {
  return /^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|<[^>]*>|\[[^\]]*\]|\*+|x+|\.\.\.|password|passwd|pass|secret|changeme|postgres|root|user|example|test|dev|local)$/i.test(password);
}

function isLocalHost(host) {
  const h = host.toLowerCase();
  if (!h.includes(".")) return true; // localhost, or a service in docker compose ("db")
  return /^(?:127\.\d+\.\d+\.\d+|0\.0\.0\.0)$/.test(h) || /\.(?:local|localhost|test|example|invalid|internal)$/.test(h);
}

/**
 * Rule 9: phrases that present a project as its users' property, or as
 * approved by our.one. Read in README.md and in files that render a page.
 */
export const CLAIMS = [
  { re: /\b(?:users?|members?|community|people|customers?)[- ]owned\b/gi, what: "presents it as its users' property" },
  { re: /\bowned\s+(?:and\s+[\w-]+\s+)?by\s+(?:all\s+(?:of\s+)?)?(?:its|their|our|the)\s+(?:own\s+)?(?:users|members|people|community|customers)\b/gi, what: "presents it as its users' property" },
  { re: /\b(?:its|the|our)\s+(?:users|members|people|community)\s+(?:now\s+|together\s+|jointly\s+|collectively\s+)?own\s+(?:it|this)\b/gi, what: "presents it as its users' property" },
  { re: /\b(?:approved|certified|endorsed|verified|vetted|accredited|listed)\s+by\s+our\.one\b/gi, what: "presents it as approved or listed by our.one" },
  { re: /\bour\.one[- ](?:approved|certified|verified|endorsed)\b/gi, what: "presents it as approved by our.one" },
];

/** Open-source licences, by SPDX id, with words their text always carries. */
export const LICENCES = {
  "Apache-2.0": [/Apache License/i, /Version 2\.0/i],
  MIT: [/Permission is hereby granted, free of charge/i],
  "MIT-0": [/Permission is hereby granted, free of charge/i],
  "BSD-2-Clause": [/Redistribution and use in source and binary forms/i],
  "BSD-3-Clause": [/Redistribution and use in source and binary forms/i, /Neither the name/i],
  ISC: [/Permission to use, copy, modify, and\/or distribute this software/i],
  "MPL-2.0": [/Mozilla Public License,? Version 2\.0/i],
  "GPL-2.0-only": [/GNU GENERAL PUBLIC LICENSE/i, /Version 2/i],
  "GPL-2.0-or-later": [/GNU GENERAL PUBLIC LICENSE/i, /Version 2/i],
  "GPL-3.0-only": [/GNU GENERAL PUBLIC LICENSE/i, /Version 3/i],
  "GPL-3.0-or-later": [/GNU GENERAL PUBLIC LICENSE/i, /Version 3/i],
  "LGPL-3.0-only": [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 3/i],
  "LGPL-3.0-or-later": [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 3/i],
  "AGPL-3.0-only": [/GNU AFFERO GENERAL PUBLIC LICENSE/i, /Version 3/i],
  "AGPL-3.0-or-later": [/GNU AFFERO GENERAL PUBLIC LICENSE/i, /Version 3/i],
  "EUPL-1.2": [/EUROPEAN UNION PUBLIC LICEN[CS]E v\. ?1\.2/i],
  Unlicense: [/free and unencumbered software released into the public domain/i],
  "BSL-1.0": [/Boost Software License - Version 1\.0/i],
  Zlib: [/This software is provided 'as-is', without any express or implied/i],
};

const LICENCE_FILE = /^(?:licen[cs]e|copying)(?:[-.][\w.-]+)?$/i;

/* ------------------------------------------------------------ the files */

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".output", ".vercel", ".turbo", "dist", "build", "out", "coverage", "vendor", ".cache", "target", "__pycache__", ".venv", "venv"]);
const MAX_BYTES = 1_000_000;
const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const MARKUP = /\.(?:html?|[cm]?[jt]sx?|vue|svelte|astro|mdx|ejs|hbs|liquid|php|erb)$/i;
const RENDERS = /\.(?:html?|jsx|tsx|vue|svelte|astro|mdx)$/i;
const TEST = /(?:^|\/)(?:__tests__|__mocks__|tests?|e2e|spec|fixtures?|cypress|playwright)\/|\.(?:test|spec|stories)\.[cm]?[jt]sx?$/i;

function toPosix(path) {
  return path.split(sep).join("/");
}

/** Files under the project, as posix paths relative to it: git's list where there is one. */
function listFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    const files = [...new Set(out.split("\0").filter(Boolean))];
    return { files: files.filter((f) => isPlainFile(join(root, f))), git: true };
  } catch {
    const files = [];
    walk(root, "", files);
    return { files, git: false };
  }
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

function readText(root, rel, skipped) {
  const path = join(root, rel);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return null;
  }
  if (size > MAX_BYTES) {
    skipped.large.push(rel);
    return null;
  }
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8000).includes(0)) {
    skipped.binary += 1;
    return null;
  }
  return buffer.toString("utf8");
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/* ------------------------------------------------------------ imports */

const IMPORTS = [
  /\bimport\s+(?!type\b)(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bexport\s+(?!type\b)(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

/** Every module a file imports, with the line it is on. */
export function importsOf(text) {
  const found = [];
  for (const re of IMPORTS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) found.push({ spec: m[1], line: lineAt(text, m.index) });
  }
  return found;
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

/* ------------------------------------------------------------ project */

function loadProject(root) {
  const skipped = { large: [], binary: 0 };
  const { files, git } = listFiles(root);
  const self = selfInside(root);
  const selfHash = sha256(readFileSync(fileURLToPath(import.meta.url)));
  const selfSize = statSync(fileURLToPath(import.meta.url)).size;
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
    if (ENV_FILE.test(basename(rel)) && !ENV_EXAMPLE.test(basename(rel))) continue; // never read
    if (isSelfCopy(rel)) continue;
    readable.push(rel);
  }
  const text = (rel) => {
    if (!texts.has(rel)) texts.set(rel, readText(root, rel, skipped));
    return texts.get(rel);
  };

  let manifest = null;
  let manifestError = null;
  if (files.includes(MANIFEST) || existsSync(join(root, MANIFEST))) {
    try {
      manifest = JSON.parse(readFileSync(join(root, MANIFEST), "utf8"));
    } catch (error) {
      manifestError = error instanceof Error ? error.message : String(error);
    }
  }

  let pkg = null;
  if (existsSync(join(root, "package.json"))) {
    try {
      pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    } catch {
      pkg = null;
    }
  }

  // Imports, from source files that aren't tests.
  const imports = [];
  for (const rel of readable) {
    if (!SOURCE.test(rel) || TEST.test(rel)) continue;
    const t = text(rel);
    if (t === null) continue;
    for (const i of importsOf(t)) imports.push({ ...i, file: rel });
  }

  const deps = new Set();
  if (pkg && typeof pkg === "object") {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      const block = pkg[field];
      if (block && typeof block === "object") for (const name of Object.keys(block)) deps.add(name);
    }
  }

  return { root, files, git, readable, text, manifest, manifestError, pkg, imports, deps, skipped };
}

function selfInside(root) {
  const self = fileURLToPath(import.meta.url);
  const raw = relative(root, self);
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

export const TOP_KEYS = ["$schema", "rules", "name", "purpose", "maintainers", "source", "license", "costs", "data", "claims"];
export const DATA_KEYS = ["collects", "sharedWith", "boundary", "export", "delete"];

/** The manifest's shape (STRUCTURAL). Every problem is listed at once. */
function checkManifest(p) {
  const id = "manifest";
  const title = "our.one.json is present and complete";
  if (p.manifestError !== null) {
    return result(id, title, "STRUCTURAL", FAIL, "our.one.json isn't valid JSON.", [
      { message: `It doesn't parse: ${p.manifestError}`, file: MANIFEST, fix: "Fix the JSON. Comments and trailing commas aren't allowed." },
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
      add(`Unknown field "${key}".${hint}`, `Remove it. The fields are: ${TOP_KEYS.join(", ")}.`);
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
      for (const key of Object.keys(person)) if (!["name", "contact"].includes(key)) add(`maintainers[${i}] has an unknown field "${key}".`, "Remove it.");
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
    for (const key of Object.keys(d)) if (!DATA_KEYS.includes(key)) add(`Unknown field "data.${key}".`, `Remove it. The fields are: ${DATA_KEYS.join(", ")}.`);
    if (!Array.isArray(d.collects)) {
      add('"data.collects" must be a list, empty only if it keeps nothing about anyone.', 'Add [{"what": "…", "why": "…", "kept": "…"}] for each kind of personal data.');
    } else {
      d.collects.forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return add(`data.collects[${i}] must be an object.`, "Fix it.");
        for (const key of Object.keys(item)) if (!["what", "why", "kept"].includes(key)) add(`data.collects[${i}] has an unknown field "${key}".`, 'The fields are "what", "why" and "kept".');
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
        for (const key of Object.keys(item)) if (!["who", "what", "why", "packages"].includes(key)) add(`data.sharedWith[${i}] has an unknown field "${key}".`, 'The fields are "who", "what", "why" and "packages".');
        if (!str(item.who, 1, 120)) add(`data.sharedWith[${i}].who is missing, or longer than 120 characters.`, "Name the service.", `data.sharedWith[${i}].who`);
        if (!str(item.what, 1, 400)) add(`data.sharedWith[${i}].what is missing, or longer than 400 characters.`, "Say what it receives.", `data.sharedWith[${i}].what`);
        if (!str(item.why, 1, 600)) add(`data.sharedWith[${i}].why is missing, or longer than 600 characters.`, "Say why.", `data.sharedWith[${i}].why`);
        if (item.packages !== undefined && (!Array.isArray(item.packages) || item.packages.some((x) => !str(x, 1, 214)))) add(`data.sharedWith[${i}].packages must be a list of package names.`, "Fix it.");
      });
    }
    if (d.boundary !== undefined && (!Array.isArray(d.boundary) || d.boundary.some((x) => typeof x !== "string"))) add('"data.boundary" must be a list of folders.', 'For example ["src/data"].');
    if (!str(d.export, 1, 400)) add('"data.export" must say how a person downloads their data.', 'For example "Settings, then Download your data".', "data.export");
    if (!str(d.delete, 1, 400)) add('"data.delete" must say how a person deletes their data.', 'For example "Settings, then Delete account".', "data.delete");
  }
  if (m.claims !== undefined) {
    const c = m.claims;
    if (typeof c !== "object" || c === null || Array.isArray(c) || Object.keys(c).some((k) => k !== "allowed") || !Array.isArray(c.allowed)) {
      add('"claims" may only hold "allowed": a list of {file, text, why}.', "Fix it, or remove it.");
    } else {
      c.allowed.forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item) || Object.keys(item).some((k) => !["file", "text", "why"].includes(k)) || !str(item.file, 1, 400) || !str(item.text, 8, 600) || !str(item.why, 8, 600)) {
          add(`claims.allowed[${i}] needs "file", "text" (the exact sentence) and "why".`, "Fix it.");
        }
      });
    }
  }
  for (const path of todos) problems.push({ message: `${path} still says TODO.`, file: MANIFEST, fix: "Fill it in." });
  return problems.length === 0
    ? result(id, title, "STRUCTURAL", PASS, "our.one.json is complete.")
    : result(id, title, "STRUCTURAL", FAIL, `our.one.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}.`, problems);
}

/** The licence (CHECKED): open source, in a licence file, the same as package.json's. */
function checkLicence(p) {
  const id = "licence";
  const title = "It has an open-source licence";
  const declared = p.manifest && typeof p.manifest.license === "string" ? p.manifest.license.trim() : "";
  if (!declared || isTodo(declared)) {
    return result(id, title, "CHECKED", FAIL, "No licence is named in our.one.json.", [
      { message: '"license" names no licence.', file: MANIFEST, fix: "Ask the person which open-source licence to use (Apache-2.0 is the feed's), add its text as LICENSE, and name it here." },
    ]);
  }
  const findings = [];
  const ids = declared.replace(/^\(|\)$/g, "").split(/\s+OR\s+/);
  const known = new Map(Object.keys(LICENCES).map((k) => [k.toLowerCase(), k]));
  const canonical = ids.map((x) => known.get(x.trim().toLowerCase()) ?? null);
  if (canonical.some((x) => x === null)) {
    findings.push({ message: `"${declared}" isn't on the tool's list of open-source licences.`, file: MANIFEST, fix: `Use one of: ${Object.keys(LICENCES).join(", ")}. (A choice of two is written "MIT OR Apache-2.0".)` });
  }
  const licenceFiles = p.files.filter((f) => !f.includes("/") && LICENCE_FILE.test(f));
  if (licenceFiles.length === 0) {
    findings.push({ message: "There is no licence file (LICENSE, LICENCE or COPYING) at the project's root.", fix: "Add the licence's full text as LICENSE." });
  } else if (canonical.every((x) => x !== null)) {
    const texts = licenceFiles.map((f) => p.text(f) ?? "");
    for (const licence of canonical) {
      if (!texts.some((t) => LICENCES[licence].every((re) => re.test(t)))) {
        findings.push({ message: `No licence file holds the text of ${licence}.`, file: licenceFiles[0], fix: `Put the full text of ${licence} in ${licenceFiles[0]}.` });
      }
    }
  }
  const pkgLicense = p.pkg && typeof p.pkg.license === "string" ? p.pkg.license.trim() : null;
  if (pkgLicense && pkgLicense.toLowerCase() !== declared.toLowerCase()) {
    findings.push({ message: `package.json says "${pkgLicense}", our.one.json says "${declared}".`, file: "package.json", fix: "Make them the same." });
  }
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, `${canonical.join(" or ")}, in ${licenceFiles.join(", ")}.`)
    : result(id, title, "CHECKED", FAIL, "The licence isn't in order.", findings);
}

/** The rules block in AGENTS.md (CHECKED): present, and word for word. */
function checkAgents(p) {
  const id = "agents";
  const title = "AGENTS.md carries the rules, unchanged";
  const fix = `run node ${DEFAULT_TOOL_PATH} init. It puts the block back word for word.`;
  const agentsFile = p.files.find((f) => f.toLowerCase() === "agents.md") ?? (existsSync(join(p.root, "AGENTS.md")) ? "AGENTS.md" : null);
  if (!agentsFile) return result(id, title, "CHECKED", FAIL, "There is no AGENTS.md.", [{ message: "There is no AGENTS.md, so agents working on this code don't get the rules.", fix }]);
  const text = normaliseBlock(p.text(agentsFile) ?? "");
  const begin = text.indexOf("<!-- our.one rules ");
  if (begin === -1) return result(id, title, "CHECKED", FAIL, "AGENTS.md has no rules block.", [{ message: "AGENTS.md doesn't carry the our.one rules.", file: agentsFile, fix }]);
  const version = /^<!-- our\.one rules ([\w.-]+): begin/.exec(text.slice(begin))?.[1];
  if (version !== RULES_VERSION) {
    return result(id, title, "CHECKED", FAIL, `AGENTS.md carries rules ${version ?? "of an unknown version"}.`, [
      { message: `The block is for rules ${version ?? "?"}; this tool checks rules ${RULES_VERSION}.`, file: agentsFile, line: lineAt(text, begin), fix },
    ]);
  }
  const block = normaliseBlock(RULES_BLOCK);
  if (text.indexOf(block) === -1) {
    return result(id, title, "CHECKED", FAIL, "The rules block in AGENTS.md was changed.", [
      { message: "The rules block isn't word for word what the tool expects.", file: agentsFile, line: lineAt(text, begin), fix },
    ]);
  }
  return result(id, title, "CHECKED", PASS, `${agentsFile} carries rules ${RULES_VERSION}, unchanged.`);
}

function normaliseBlock(text) {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n");
}

/** What it does with personal data is declared (STRUCTURAL). */
function checkData(p) {
  const id = "data";
  const title = "Its personal data is declared";
  const d = p.manifest?.data;
  if (!d || typeof d !== "object") return result(id, title, "STRUCTURAL", FAIL, "our.one.json has no data section.", [{ message: "There is no data section.", file: MANIFEST, fix: "Fill in data: collects, sharedWith, boundary, export and delete." }]);
  const findings = [];
  if (!Array.isArray(d.collects)) findings.push({ message: "data.collects isn't a list.", file: MANIFEST, fix: "List what it keeps about people." });
  if (!Array.isArray(d.sharedWith)) findings.push({ message: "data.sharedWith isn't a list.", file: MANIFEST, fix: "List the outside services that receive anything about people." });
  if (!str(d.export, 1, 400) || isTodo(d.export)) findings.push({ message: "data.export doesn't say how a person downloads their data.", file: MANIFEST, fix: "Say how, and build it." });
  if (!str(d.delete, 1, 400) || isTodo(d.delete)) findings.push({ message: "data.delete doesn't say how a person deletes their data.", file: MANIFEST, fix: "Say how, and build it." });
  if (findings.length > 0) return result(id, title, "STRUCTURAL", FAIL, "The data section isn't complete.", findings);
  const n = d.collects.length;
  const s = d.sharedWith.length;
  return result(id, title, "STRUCTURAL", PASS, n === 0 ? "It declares that it keeps nothing about anyone." : `It declares ${n} kind${n === 1 ? "" : "s"} of personal data and ${s} outside service${s === 1 ? "" : "s"}, with export and deletion.`);
}

/** Rule 1 (CHECKED): only code inside the boundary imports a store's client. */
function checkBoundary(p) {
  const id = "boundary";
  const title = "Personal data stays inside the boundary";
  const hasSource = p.readable.some((f) => SOURCE.test(f) && !TEST.test(f));
  if (!hasSource) return result(id, title, "CHECKED", NOT_CHECKED, "No JavaScript or TypeScript found. In rules 0 the tool reads only those, so a person checks this.");
  const uses = [];
  for (const i of p.imports) {
    const pkg = packageOf(i.spec);
    if (pkg && STORES.some((s) => matches(s, i.spec))) uses.push({ file: i.file, line: i.line, what: i.spec });
  }
  for (const rel of p.readable) {
    if (!SOURCE.test(rel) || TEST.test(rel)) continue;
    const t = p.text(rel);
    if (t === null) continue;
    for (const call of STORE_CALLS) {
      call.re.lastIndex = 0;
      for (const m of t.matchAll(call.re)) uses.push({ file: rel, line: lineAt(t, m.index), what: call.name });
    }
  }
  if (uses.length === 0) return result(id, title, "CHECKED", PASS, "No database or file-store client found in the code.");
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
      findings.push({ message: `"${entry}" isn't a folder inside the project.`, file: MANIFEST, fix: "Name the folders that hold the code reaching the store, not the whole project." });
      continue;
    }
    if (!existsSync(join(p.root, clean))) findings.push({ message: `data.boundary names "${clean}", which doesn't exist.`, file: MANIFEST, fix: "Name a folder that exists." });
    boundary.push(clean);
  }
  for (const use of uses) {
    if (!boundary.some((b) => use.file === b || use.file.startsWith(`${b}/`))) {
      findings.push({ message: `${use.what} is used outside the boundary.`, file: use.file, line: use.line, fix: `Move this into ${boundary[0] ?? "the boundary"}, and call it from there.` });
    }
  }
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, `Only code in ${boundary.join(", ")} reaches a store (${uses.length} place${uses.length === 1 ? "" : "s"}).`)
    : result(id, title, "CHECKED", FAIL, "Code outside the boundary reaches a store.", findings);
}

/** Rule 3 (CHECKED): every outside service it uses is named. */
function checkLeave(p) {
  const id = "leave";
  const title = "Every outside service that receives data is named";
  if (!p.pkg && !p.readable.some((f) => SOURCE.test(f))) return result(id, title, "CHECKED", NOT_CHECKED, "No package.json and no JavaScript or TypeScript. In rules 0 the tool reads only those, so a person checks this.");
  const used = new Map();
  for (const dep of p.deps) {
    for (const service of SERVICES) if (service.packages.some((e) => matches(e, dep))) used.set(`${service.name}|${dep}`, { service, pkg: dep, file: "package.json", line: undefined });
  }
  for (const i of p.imports) {
    const pkg = packageOf(i.spec);
    if (!pkg) continue;
    for (const service of SERVICES) {
      if (service.packages.some((e) => matches(e, pkg)) && !used.has(`${service.name}|${pkg}`)) used.set(`${service.name}|${pkg}`, { service, pkg, file: i.file, line: i.line });
    }
  }
  if (used.size === 0) return result(id, title, "CHECKED", PASS, "No outside service the tool knows is used.");
  const shared = Array.isArray(p.manifest?.data?.sharedWith) ? p.manifest.data.sharedWith : [];
  const declared = shared.flatMap((s) => (Array.isArray(s?.packages) ? s.packages.filter((x) => typeof x === "string") : []));
  const findings = [];
  const named = new Set();
  for (const { service, pkg, file, line } of used.values()) {
    if (declared.some((d) => matches(d, pkg) || d === pkg)) {
      named.add(service.name);
    } else {
      findings.push({ message: `${pkg} sends data to ${service.name}, which data.sharedWith doesn't name.`, file, line, fix: `Add {"who": "${service.name}", "what": "…", "why": "…", "packages": ["${pkg}"]} to data.sharedWith, or stop using it.` });
    }
  }
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, `Named: ${[...named].join(", ")}.`)
    : result(id, title, "CHECKED", FAIL, "An outside service isn't named.", findings);
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
    const text = p.text(rel);
    if (text === null) continue;
    for (const t of TRACKING) {
      for (const host of t.hosts ?? []) {
        const re = new RegExp(`(?:https?:)?//(?:[a-z0-9-]+\\.)*${host.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "gi");
        for (const m of text.matchAll(re)) flag(t.name, `loads ${host}`, rel, lineAt(text, m.index));
      }
      for (const call of t.calls ?? []) {
        call.lastIndex = 0;
        for (const m of text.matchAll(call)) flag(t.name, "turned on in code", rel, lineAt(text, m.index));
      }
    }
    NEXT_THIRD_PARTIES_GOOGLE.lastIndex = 0;
    for (const m of text.matchAll(NEXT_THIRD_PARTIES_GOOGLE)) {
      const which = GOOGLE_COMPONENTS.exec(m[1])?.[1];
      if (which) flag(which.includes("GTM") || which.includes("TagManager") ? "Google Tag Manager" : "Google Analytics", `imports ${which} from @next/third-parties`, rel, lineAt(text, m.index));
    }
  }
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, "No ad network, pixel, Google Analytics, Tag Manager, session recording or data hub the tool knows.")
    : result(id, title, "CHECKED", FAIL, "It loads ads or tracking.", findings);
}

/** Rule 8 (CHECKED): no secrets in tracked files. Prints where, never what. */
function checkSecrets(p) {
  const id = "secrets";
  const title = "No secrets in the code";
  const findings = [];
  for (const rel of p.files) {
    const name = basename(rel);
    if (ENV_FILE.test(name) && !ENV_EXAMPLE.test(name)) {
      if (p.git) findings.push({ message: `${rel} is an environment file, and git doesn't ignore it.`, file: rel, fix: `Add ${name} to .gitignore and remove it from the repository (git rm --cached ${rel}). If it was ever pushed, replace every secret in it.` });
    }
  }
  for (const rel of p.readable) {
    const text = p.text(rel);
    if (text === null) continue;
    for (const s of SECRETS) {
      s.re.lastIndex = 0;
      for (const m of text.matchAll(s.re)) {
        if (s.real && !s.real(m)) continue;
        findings.push({ message: `${rel} holds what looks like ${s.kind}.`, file: rel, line: lineAt(text, m.index), fix: "Move it to an environment variable, and replace it: anyone who saw the file has it." });
      }
    }
  }
  const note = p.git ? "" : " (Not a git repository, so environment files weren't checked.)";
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, `No secret the tool recognises.${note}`)
    : result(id, title, "CHECKED", FAIL, "It looks like a secret is in the code.", findings);
}

/** Rule 7 (CHECKED): the costs file exists and is filled in. */
function checkCosts(p) {
  const id = "costs";
  const title = "Its costs are public";
  const path = p.manifest && typeof p.manifest.costs === "string" ? p.manifest.costs.trim().replace(/\\/g, "/").replace(/^\.\//, "") : "";
  if (!path || isTodo(path)) return result(id, title, "CHECKED", FAIL, "No costs file is named.", [{ message: '"costs" names no file.', file: MANIFEST, fix: 'Write "COSTS.md", and fill it in.' }]);
  if (path.startsWith("/") || path.split("/").includes("..")) return result(id, title, "CHECKED", FAIL, "The costs file is outside the project.", [{ message: `"${path}" is outside the project.`, file: MANIFEST, fix: "Keep the costs file in the project, where everyone can read it." }]);
  if (!isPlainFile(join(p.root, path))) return result(id, title, "CHECKED", FAIL, `${path} doesn't exist.`, [{ message: `our.one.json names ${path}, which doesn't exist.`, file: MANIFEST, fix: `Create ${path}: what it costs to run each month, and who pays.` }]);
  if (p.git && !p.files.includes(path)) return result(id, title, "CHECKED", FAIL, `git ignores ${path}.`, [{ message: `${path} is ignored by git, so nobody else can read it.`, file: MANIFEST, fix: `Keep ${path} in the repository.` }]);
  const text = p.text(path) ?? "";
  if (text.trim().length < 20) return result(id, title, "CHECKED", FAIL, `${path} is empty.`, [{ message: `${path} says nothing yet.`, file: path, fix: "Write what it costs to run each month, and who pays." }]);
  if (/\bTODO\b/.test(text)) return result(id, title, "CHECKED", FAIL, `${path} still says TODO.`, [{ message: `${path} still has TODO in it.`, file: path, line: lineAt(text, text.search(/\bTODO\b/)), fix: "Fill it in." }]);
  return result(id, title, "CHECKED", PASS, `${path}.`);
}

/** Rule 9 (CHECKED): no claim of users' ownership, or of our.one's approval. */
function checkClaims(p) {
  const id = "claims";
  const title = "It claims only what is true";
  const allowed = Array.isArray(p.manifest?.claims?.allowed) ? p.manifest.claims.allowed.filter((a) => a && typeof a.file === "string" && typeof a.text === "string") : [];
  const used = new Set();
  const findings = [];
  const files = p.readable.filter((f) => !TEST.test(f) && (RENDERS.test(f) || /^readme(?:\.md)?$/i.test(f)));
  for (const rel of files) {
    const original = p.text(rel);
    if (original === null) continue;
    const { text, at } = normaliseText(original);
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
      claim.re.lastIndex = 0;
      for (const m of text.matchAll(claim.re)) {
        if (spans.some(([s, e]) => m.index >= s && m.index + m[0].length <= e)) continue;
        findings.push({ message: `"${m[0]}" ${claim.what}.`, file: rel, line: lineAt(original, at[m.index] ?? 0), fix: "Only our.one's records can make that true. Remove it, or, if it's a definition or a denial, list the exact sentence in our.one.json under claims.allowed, with why." });
      }
    }
  }
  allowed.forEach((a, index) => {
    if (!used.has(index)) findings.push({ message: `claims.allowed lists a sentence that isn't in ${a.file}.`, file: MANIFEST, fix: "Remove it, or correct the file or the sentence." });
  });
  return findings.length === 0
    ? result(id, title, "CHECKED", PASS, allowed.length === 0 ? "No claim of users' ownership or of our.one's approval." : `No claim, beyond ${allowed.length} sentence${allowed.length === 1 ? "" : "s"} listed in claims.allowed for a person to read.`)
    : result(id, title, "CHECKED", FAIL, "It claims something only our.one's records can make true.", findings);
}

/** Whitespace as one space, and the common entities decoded, keeping each character's place in the original. */
function normaliseText(original) {
  const entities = { "&nbsp;": " ", "&apos;": "'", "&#39;": "'", "&rsquo;": "'", "&quot;": '"', "&amp;": "&", "&#x27;": "'" };
  let text = "";
  const at = [];
  let i = 0;
  while (i < original.length) {
    const ch = original[i];
    if (/\s/.test(ch)) {
      const start = i;
      while (i < original.length && /\s/.test(original[i])) i += 1;
      if (text.length > 0 && text[text.length - 1] !== " ") {
        text += " ";
        at.push(start);
      }
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

/** Every check, in the report's order (D-0019 §C). */
export function check(root) {
  const p = loadProject(root);
  const checks = [checkManifest, checkLicence, checkAgents, checkData, checkBoundary, checkLeave, checkTracking, checkSecrets, checkCosts, checkClaims].map((c) => c(p));
  const failed = checks.filter((c) => c.outcome === FAIL);
  return {
    tool: "our-one",
    version: VERSION,
    rules: RULES_VERSION,
    sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    project: basename(root),
    result: failed.length === 0 ? "ready" : "not-ready",
    checks,
    forAPerson: FOR_A_PERSON,
    notBuilt: NOT_BUILT,
    skipped: { large: p.skipped.large, binary: p.skipped.binary },
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
  if (r.skipped.large.length > 0) out.push("", wrap(`Not read, over 1 MB: ${r.skipped.large.join(", ")}.`, 66, "  "));
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
  lines.push(`Fix these, run node ${DEFAULT_TOOL_PATH} check until it passes, then finish. Don't change the check or the rules block to make it pass.`);
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

A proposal to our.one. The common agreement asks every proposal for the
parts below: https://our.one/agreement. Send it by email when proposals
open; the address is on https://our.one/maintainers.

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

## Before work starts

What has to happen first, and what happens if it doesn't.

## The check

The last lines of \`node scripts/our-one.mjs check\`, and the commit it
ran on.
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
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
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
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const known = Object.keys(LICENCES).find((k) => k.toLowerCase() === String(pkg.license ?? "").toLowerCase());
    if (known) license = known;
  } catch {
    // No package.json: the field stays TODO.
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
      collects: [],
      sharedWith: [],
      boundary: [],
      export: "TODO: how a person downloads their data",
      delete: "TODO: how a person deletes their data",
    },
  };
}

/** Create a file only if it doesn't exist. */
function create(root, rel, content, report) {
  const path = join(root, rel);
  if (existsSync(path)) {
    report.kept.push(rel);
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { flag: "wx" });
  report.created.push(rel);
  return true;
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
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `# AGENTS.md\n\nInstructions for any coding agent working on this project.\n\n${RULES_BLOCK}\n`, { flag: "wx" });
    report.created.push("AGENTS.md");
  } else {
    const current = readFileSync(agentsPath, "utf8");
    const re = /<!-- our\.one rules [\w.-]+: begin[\s\S]*?<!-- our\.one rules [\w.-]+: end -->/;
    const next = re.test(current) ? current.replace(re, () => RULES_BLOCK) : `${current.replace(/\s*$/, "")}\n\n${RULES_BLOCK}\n`;
    if (next !== current) {
      writeFileSync(agentsPath, next);
      report.updated.push("AGENTS.md (the rules block)");
    } else {
      report.kept.push("AGENTS.md");
    }
  }

  // CLAUDE.md imports AGENTS.md, so Claude Code reads the rules too.
  const claudePath = join(root, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, "@AGENTS.md\n", { flag: "wx" });
    report.created.push("CLAUDE.md");
  } else if (!/^@AGENTS\.md\s*$/m.test(readFileSync(claudePath, "utf8"))) {
    writeFileSync(claudePath, `${readFileSync(claudePath, "utf8").replace(/\s*$/, "")}\n\n@AGENTS.md\n`);
    report.updated.push("CLAUDE.md (imports AGENTS.md)");
  } else {
    report.kept.push("CLAUDE.md");
  }

  create(root, "COSTS.md", COSTS_TEMPLATE, report);
  create(root, "PITCH.md", PITCH_TEMPLATE, report);

  // The stop hook: Claude Code runs the check whenever it tries to finish.
  const hook = { type: "command", command: hookCommand(toolPath) };
  const settingsRel = ".claude/settings.json";
  const settingsPath = join(root, settingsRel);
  if (!existsSync(settingsPath)) {
    create(root, settingsRel, `${JSON.stringify({ hooks: { Stop: [{ hooks: [hook] }] } }, null, 2)}\n`, report);
  } else {
    let settings = null;
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      settings = null;
    }
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      report.notes.push(`${settingsRel} isn't valid JSON, so it was left alone. Add a Stop hook that runs: ${hook.command}`);
      report.kept.push(settingsRel);
    } else {
      const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? settings.hooks : {};
      const stop = Array.isArray(hooks.Stop) ? hooks.Stop : [];
      const present = JSON.stringify(stop).includes("our-one.mjs");
      if (present) {
        report.kept.push(settingsRel);
      } else {
        settings.hooks = { ...hooks, Stop: [...stop, { hooks: [hook] }] };
        writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
        report.updated.push(`${settingsRel} (the stop hook)`);
      }
    }
  }

  create(root, ".github/workflows/our-one.yml", workflow(toolPath), report);

  if (!readdirSync(root).some((f) => LICENCE_FILE.test(f))) report.notes.push("There is no licence file. Ask the person which open-source licence to use (Apache-2.0 is the feed's), and add its full text as LICENSE.");
  return report;
}

function formatInit(r) {
  const out = ["", `  our.one init ${VERSION} · rules ${RULES_VERSION}`, ""];
  if (r.created.length) out.push("  Created:", ...r.created.map((f) => `    ${f}`), "");
  if (r.updated.length) out.push("  Updated:", ...r.updated.map((f) => `    ${f}`), "");
  if (r.kept.length) out.push("  Already there, left as they are:", ...r.kept.map((f) => `    ${f}`), "");
  for (const n of r.notes) out.push(wrap(n, 68, "  "), "");
  out.push(wrap(`Next: fill in every TODO in our.one.json and COSTS.md, then run: node ${DEFAULT_TOOL_PATH} check`, 68, "  "), "");
  return out.join("\n");
}

/* ------------------------------------------------------------ main */

const USAGE = `our-one.mjs ${VERSION}, rules ${RULES_VERSION}

  node scripts/our-one.mjs init     set this project up for our.one
  node scripts/our-one.mjs check    check it against the rules
  node scripts/our-one.mjs rules    print the rules block

Options:
  --project <dir>   the project's folder (default: the folder holding
                    scripts/ when that has an our.one.json, otherwise here)
  --json            check: print the result as JSON
  --hook            check: run as a Claude Code stop hook
  --version         print the version and the tool's SHA-256

It makes no network request. init writes only the files it names.
Instructions for coding agents: https://our.one/build.md
`;

/** The project's folder: --project, or the folder above scripts/ when it has an our.one.json, or here. */
function projectRoot(flag) {
  if (flag) return resolve(flag);
  const self = fileURLToPath(import.meta.url);
  const above = dirname(dirname(self));
  if (basename(dirname(self)) === "scripts" && existsSync(join(above, MANIFEST))) return above;
  return process.cwd();
}

function readStdin() {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
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
  if (command === "init") {
    if (root === parse(root).root || root === homedir()) {
      process.stderr.write(`Refusing to set up ${root}: run init inside the project's own folder.\n`);
      return 2;
    }
    process.stdout.write(formatInit(init(root)));
    return 0;
  }
  const r = check(root);
  if (flags.hook) {
    let input = {};
    try {
      input = JSON.parse(readStdin() || "{}");
    } catch {
      input = {};
    }
    if (r.result === "ready") return 0;
    if (input && input.stop_hook_active === true) {
      // Sent back once already: let the agent stop, and tell the person.
      const failed = r.checks.filter((c) => c.outcome === FAIL).map((c) => c.id);
      process.stdout.write(`${JSON.stringify({ systemMessage: `our.one check still fails: ${failed.join(", ")}. Run: node ${DEFAULT_TOOL_PATH} check` })}\n`);
      return 0;
    }
    process.stderr.write(`${formatHook(r)}\n`);
    return 2;
  }
  if (flags.json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else process.stdout.write(formatReport(r));
  return r.result === "ready" ? 0 : 1;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`our-one.mjs failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
