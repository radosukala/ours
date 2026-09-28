/**
 * /signin (SPEC §8 "Sign in"): enter an email, get a link. There are no
 * passwords. Someone already signed in goes straight to /home.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/web/viewer";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

/** Whether this request has a valid session. A database error counts as no. */
async function isSignedIn(): Promise<boolean> {
  try {
    return (await getViewer()) !== null;
  } catch {
    return false;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (await isSignedIn()) redirect("/home");
  const signedOut = params.signed_out === "1";

  return (
    <div className="stack stack--lg">
      <div className="stack">
        <h1 className="headline">Sign in to our.one</h1>
        <p className="lede">
          Enter the email address of your account. We&apos;ll send you a link
          that signs you in. There&apos;s no password.
        </p>
      </div>
      {signedOut ? (
        <p className="notice" role="status">
          You&apos;re signed out.
        </p>
      ) : null}
      <SignInForm />
      <p className="muted small">
        New here? our.one is invite-only: ask someone you know to send you an
        invite link.
      </p>
    </div>
  );
}
