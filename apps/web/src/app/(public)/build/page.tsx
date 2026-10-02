/**
 * /build, "Build on our.one" (SPEC §18.18, as §18.19 amends it; M-0016 and
 * M-0017; D-0019 §G, as D-0020 §B and §D amend it): the builders'
 * invitation and its deal; the idea first, before any code; the line a
 * builder gives their coding agent, and what the agent does; the rules and
 * how each is checked; what the check can and can't tell; the proposal, by
 * email (D-0018 §D, through /maintainers); and the tools, with the tool's
 * version and SHA-256.
 *
 * Nothing in the deal is in force yet, and the line under it says so.
 * Passing the check makes a project ready to propose, nothing more (D-0019
 * §E), and the page says that too. Since D-0020 §D the page states
 * our.one's own deal and says nothing absolute about building alone.
 *
 * The rules' titles are the rules block's, word for word: tests/kit.test.ts
 * compares them with kit/our-one.mjs. The line for the agent names
 * our.one's own address; the "Today" line and the drafts follow
 * PROPOSALS_EMAIL.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CopyLine } from "@/components/public/CopyLine";
import { BUILD_TERMS } from "@/components/public/door";
import { DraftButton } from "@/components/public/Draft";
import styles from "@/components/public/public.module.css";
import { repositoryUrl } from "@/components/public/repository";
import { proposalsEmail } from "@/core/config";
import { AGENT_LINE, KIT_TOOL } from "@/core/kit-info";

/** Rendered per request: the "Today" line and the drafts follow PROPOSALS_EMAIL, as /agreement's does. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build on our.one",
  description:
    "Build something people can depend on: start with an idea and the people it would serve, then build it with your coding agent under the common agreement's rules.",
};

/** What a maintainer gives up (D-0017 §C), as /maintainers says it. */
const GIVE_UP: readonly string[] = [
  "Selling the service, or the people who use it.",
  "Money from anyone who expects a return from the service.",
  "The list of users. You get the access your service needs, and it can be withdrawn.",
];

/** What has been tried, and with which line (H15; C22 of M-0016's re-check; D-0020 §D). */
const TRIAL =
  "It's written for coding agents that can read a web page and run commands. This line hasn't been tried yet. The line before it was tried once: an agent in Claude Code, given it and a person's answers, built a small fictional app and passed version 0.1.0 of the check.";

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
  const email = proposalsEmail();
  return (
    <article className={styles.page}>
      <p className={styles.kicker}>Build with us</p>
      <h1 className="headline">Build something people can depend on.</h1>
      <p className="notice">
        {"Being developed. The tools work today. The common agreement they follow is a draft that nobody has signed yet, and none of its collective rights is in force."}
      </p>
      <p className="lede">
        {"Start with an idea and the people it would serve. Show it to them before you build it all, or bring a project you already have. When people choose a service and fund it, its agreed budget can pay you, or your team, to run it."}
      </p>

      <section aria-labelledby="build-deal">
        <h2 id="build-deal">The deal</h2>
        <h3>What you get</h3>
        <ul className="prose">
          {BUILD_TERMS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h3>What you give up</h3>
        <ul className="prose">
          {GIVE_UP.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className={styles.heldBy}>
          {email
            ? "Today: none of this is in force yet. Proposals and needs are read by hand, our.one takes no money until the holder exists, and the safeguards that keep data out of reach aren't built. "
            : "Today: none of this is in force yet. Proposals and needs open at launch, our.one takes no money until the holder exists, and the safeguards that keep data out of reach aren't built. "}
          <Link href="/agreement">The common agreement</Link>
        </p>
        <p>
          <Link href="/maintainers">The maintainer&apos;s deal</Link>
          {" has it in full, with how to propose a service and how to name a need."}
        </p>
      </section>

      <section aria-labelledby="build-idea">
        <h2 id="build-idea">1. Start with the idea</h2>
        <p>
          {"Before any code, write down what you'd build and for whom, what those people use today, and how you'd find out whether they want it. Then put it in front of them. Interest is a start. It isn't an audience, or funding."}
        </p>
        <div className={styles.drafts}>
          <DraftButton kind="idea" label="Draft an idea" email={email} className="btn btn--primary btn--large" />
        </div>
        <p>{"Your coding agent starts there too: it drafts the idea with you before it writes any code."}</p>
      </section>

      <section aria-labelledby="build-agent">
        <h2 id="build-agent">2. Build it with your coding agent</h2>
        <p>{"You don't have to build it by hand. Give your coding agent this one line:"}</p>
        <p className={styles.prompt}>
          <code>{AGENT_LINE}</code>
        </p>
        <div className={styles.drafts}>
          <CopyLine text={AGENT_LINE} className="btn btn--outline" />
        </div>
        <p>{TRIAL}</p>
        <h3 id="build-steps">What your agent does</h3>
        <ol className="prose">
          <li>{"Asks you what you want to build, who it's for, and what it will keep about them."}</li>
          <li>{"Drafts the idea with you in PITCH.md, before any code, and asks whether you'd rather find out first or build now."}</li>
          <li>
            {"Sets the project up: an our.one.json that says what it keeps and why, who else receives it, and which folders hold the code that touches it; the rules, in AGENTS.md; a costs file; and an open-source licence you choose."}
          </li>
          <li>
            {"Builds it under the rules, and runs the check before it finishes. In Claude Code, a hook runs the check each time the agent stops: if a check fails, it sends the agent back once with what fails, and tells it to ask you for anything only you know; then it lets it stop, and tells you."}
          </li>
          <li>Finishes your proposal.</li>
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
        <h2 id="build-propose">3. Then propose it</h2>
        <p>
          {"Your agent finishes the proposal in PITCH.md, with what the agreement asks of every proposal. Proposals go by email, and a person reads each one. "}
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
