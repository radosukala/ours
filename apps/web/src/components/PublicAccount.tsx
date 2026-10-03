/**
 * The right of the header on a page outside the app (D-0023 §B, §C): Sign
 * in for a visitor, Your feed for a member. The public layout and the
 * not-found page draw `Account` in a Suspense boundary of their own, with
 * `SignIn` as its fallback, so they never wait on the database for it.
 */
import Link from "next/link";
import { isMemberHere } from "@/web/viewer";

export function SignIn() {
  return (
    <Link href="/signin" className="public-header__signin">
      Sign in
    </Link>
  );
}

/** Sign in for a visitor; Your feed for a member (`isMemberHere`). */
export async function Account() {
  if (!(await isMemberHere())) return <SignIn />;
  return (
    <Link href="/home" className="public-header__signin">
      Your feed
    </Link>
  );
}
