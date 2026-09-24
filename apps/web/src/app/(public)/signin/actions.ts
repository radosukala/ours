"use server";

/**
 * Sign-in request (SPEC §8 "Sign in"). A public action: there is no viewer
 * yet. The answer is the same sentence whether or not an account exists;
 * only a malformed address or a rate limit is refused, and neither says
 * anything about the account.
 */
import { requestSignIn, SIGN_IN_ANSWER } from "@/core/accounts";
import { getDb } from "@/core/db";
import { type ActionResult, run } from "@/web/actions";
import { clientIpHash } from "@/web/request";

export type SignInState = ActionResult<{ message: string }> | null;

export async function requestSignInAction(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const email = form.get("email");
  return run(async () => {
    await requestSignIn(getDb(), {
      email: typeof email === "string" ? email : "",
      ipHash: await clientIpHash(),
    });
    return { message: SIGN_IN_ANSWER };
  });
}
