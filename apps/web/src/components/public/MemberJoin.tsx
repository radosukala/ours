/**
 * Where a visitor is asked to join, a member is shown their feed (D-0023
 * §C): on the front door's feed panel and on /feed.
 */
import Link from "next/link";
import { MEMBER_JOIN } from "./door";

export function MemberJoin() {
  return (
    <div className="stack">
      <p className="notice notice--ok">{MEMBER_JOIN.line}</p>
      <p>
        <Link href="/home" className="btn btn--primary">
          {MEMBER_JOIN.link}
        </Link>
      </p>
    </div>
  );
}
