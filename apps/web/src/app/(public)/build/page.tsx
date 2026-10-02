/**
 * /build, "Build on our.one" (SPEC §18.18, M-0016, D-0019 §G): the two ways
 * to build an app, side by side; the one line a builder gives their coding
 * agent; what the agent does; the rules and how each is checked; what the
 * check can and can't tell; the proposal, by email (D-0018 §D, through
 * /maintainers); and the tools, with the tool's version and SHA-256.
 *
 * Nothing in the our.one column is in force yet, and the column says so
 * under its last line. Passing the check makes a project ready to propose,
 * nothing more (D-0019 §E), and the page says that too.
 *
 * The rules' titles are the rules block's, word for word: tests/kit.test.ts
 * compares them with kit/our-one.mjs. The line for the agent names
 * our.one's own address; the "Today" line follows PROPOSALS_EMAIL.
 */
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/public/public.module.css";
import { repositoryUrl } from "@/components/public/repository";
import { proposalsEmail } from "@/core/config";
import { AGENT_LINE, KIT_TOOL } from "@/core/kit-info";

/** Rendered per request: the "Today" line follows PROPOSALS_EMAIL, as /agreement's does. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build on our.one",
  description:
    "Two ways to build an app, and how to start one for our.one with your coding agent: the instructions it follows, the rules, and the check it runs.",
};

type Way = { title: string; lines: readonly string[] };

const ALONE: Way = {
  title: "On your own",
  lines: [
    "You build first, then look for people to use it.",
    "You pay the costs until it earns, or take money from people who expect a return.",
    "You can sell it, and the people who use it go with the sale.",
    "If you stop, it stops.",
  ],
};

const ON_OUR_ONE: Way = {
  title: "On our.one",
  lines: [
    "People say what they need, and you propose what you'd build.",
    "If people choose it and fund it, your pay comes from that, as your agreement says. The costs and the pay are public.",
    "Nobody may sell it, you included.",
    "If you stop, someone else can be appointed and carry it on.",
    "What it keeps about people is meant to stay out of your reach.",
  ],
};

type Rule = { title: string; checked: string };

/** The rules block's ten titles (D-0019 §C), each with how it is checked. */
const RULES: readonly Rule[] = [
  { title: "Keep personal data inside the boundary.", checked: "The check reads the imports and the queries, in JavaScript and TypeScript." },
  { title: "Declare before you collect.", checked: "The check reads our.one.json. A person reads the code." },
  { title: "Name every service that receives data.", checked: "The check knows many services by their packages." },
  { title: "No ads and no tracking.", checked: "The check knows the common ones, by package and by script address." },
  { title: "Nothing is sold.", checked: "A person reads the proposal." },
  { title: "People can leave.", checked: "The check reads our.one.json. A person tries export and deletion." },
  { title: "Costs are public.", checked: "The check reads the costs file." },
  { title: "No secrets in the code.", checked: "The check knows the common kinds of key, and database files." },
  { title: "Say only what is true.", checked: "The check knows the common phrases." },
  { title: "Run the check before you finish:", checked: "The check finds the rules block unchanged. The hook and the workflow run it." },
];

export default function BuildPage() {
  return (
    <article className={styles.page}>
      <h1 className="headline">Build on our.one</h1>
      <p className="notice">
        {"Being developed. The tools work today. The common agreement they follow is a draft that nobody has signed yet, and none of its collective rights is in force."}
      </p>
      <p className="lede">
        {"Most apps are built alone: you build first, and look for people after. On our.one, you build for the people who will use it, under the common agreement: they will fund it and, in time, decide how it's run."}
      </p>

      <section aria-labelledby="build-ways">
        <h2 id="build-ways">Two ways to build</h2>
        <div className={styles.ways}>
          {[ALONE, ON_OUR_ONE].map((way) => (
            <div key={way.title} className={styles.way}>
              <h3 className={styles.itemTitle}>{way.title}</h3>
              <ul className={styles.wayList}>
                {way.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {way === ON_OUR_ONE ? (
                <p className={styles.heldBy}>
                  {proposalsEmail()
                    ? "Today: none of this is in force yet. Proposals and needs are read by hand, our.one takes no money until the holder exists, and the safeguards that keep data out of reach aren't built. "
                    : "Today: none of this is in force yet. Proposals and needs open at launch, our.one takes no money until the holder exists, and the safeguards that keep data out of reach aren't built. "}
                  <Link href="/agreement">The common agreement</Link>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="build-agent">
        <h2 id="build-agent">Start with your coding agent</h2>
        <p>{"You don't have to build it by hand. Give your coding agent this one line:"}</p>
        <p className={styles.prompt}>
          <code>{AGENT_LINE}</code>
        </p>
        <p>
          {"It's written for coding agents that can read a web page and run commands. So far it has been tried once: an agent in Claude Code, given this line and a person's answers, built a small fictional app and passed version 0.1.0 of the check."}
        </p>
      </section>

      <section aria-labelledby="build-steps">
        <h2 id="build-steps">What your agent does</h2>
        <ol className="prose">
          <li>{"Asks you what you want to build, who it's for, and what it will keep about them."}</li>
          <li>
            {"Sets the project up: an our.one.json that says what it keeps and why, who else receives it, and which folders hold the code that touches it; the rules, in AGENTS.md; a costs file; and an open-source licence you choose."}
          </li>
          <li>
            {"Builds it under the rules, and runs the check before it finishes. In Claude Code, a hook runs the check each time the agent stops: if a check fails, it sends the agent back once with what fails, and tells it to ask you for anything only you know; then it lets it stop, and tells you."}
          </li>
          <li>Drafts your proposal.</li>
        </ol>
      </section>

      <section aria-labelledby="build-rules">
        <h2 id="build-rules">The rules</h2>
        <p>
          {"Ten rules. Seven put the common agreement's terms in words an agent can act on; three go further than its words, and wait for the founder's approval: the boundary in rule 1, and no session recording and no data hubs in rule 4. Your agent keeps them in the project's AGENTS.md, and the check reads the code for the ones a machine can see."}
        </p>
        <ol className={styles.promiseList}>
          {RULES.map((rule) => (
            <li key={rule.title} className={styles.promiseItem}>
              <p>
                <strong>{rule.title.replace(/:$/, ".")}</strong>
              </p>
              <p className={styles.heldBy}>{rule.checked}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="build-limits">
        <h2 id="build-limits">What the check can tell, and what it can&apos;t</h2>
        <p>
          {"It reads your files. It can't see what your code does when it runs, so our.one runs its own copy of the check on the commit you propose, and a person reads the result."}
        </p>
        <p>
          {"Passing makes a project ready to propose. Nothing more: it isn't listed, approved or protected. The people who would use it decide."}
        </p>
        <p>
          {"The safeguards that would hold the line while a service runs, such as no keys for whoever runs it and a record of every read, aren't built yet. Every report lists them."}
        </p>
      </section>

      <section aria-labelledby="build-propose">
        <h2 id="build-propose">Then propose it</h2>
        <p>
          {"Your agent drafts the proposal in PITCH.md, with what the agreement asks of every proposal. Proposals go by email, and a person reads each one. "}
          <Link href="/maintainers">Build the next one</Link>
          {" says where to send it, what the job is, and what you get and give up."}
        </p>
      </section>

      <section aria-labelledby="build-tools">
        <h2 id="build-tools">The tools</h2>
        <ul className="prose">
          <li>
            <a href="/build.md">build.md</a>
            {": the instructions your agent reads."}
          </li>
          <li>
            <a href="/kit/our-one.mjs">our-one.mjs</a>
            {`: sets a project up and checks it. Version ${KIT_TOOL.version}, rules ${KIT_TOOL.rules}. One file, with no dependencies and no network access. Its `}
            <span className={styles.nowrap}>SHA-256</span>
            {": "}
            <code className={styles.hash}>{KIT_TOOL.sha256}</code>
          </li>
          <li>
            <a href="/kit/our.one.schema.json">The schema of our.one.json</a>
            {"."}
          </li>
          <li>
            <a href={repositoryUrl("apps/web/our.one.json")} rel="noopener noreferrer" target="_blank">
              The feed&apos;s own our.one.json
            </a>
            {": it passes the same check."}
          </li>
          <li>
            <a href={repositoryUrl("kit", true)} rel="noopener noreferrer" target="_blank">
              The kit&apos;s source
            </a>
            {", under the "}
            <span className={styles.nowrap}>Apache-2.0</span>
            {" licence."}
          </li>
        </ul>
      </section>
    </article>
  );
}
