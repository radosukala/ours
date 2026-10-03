/**
 * The shape every server action returns (SPEC §10):
 * `{ ok: true, … } | { ok: false, error }`, where `error` is a sentence a
 * person can read.
 *
 * Use it in a route's actions.ts ("use server"):
 *
 *   export async function createPostAction(_prev: unknown, form: FormData) {
 *     return run(async () => {
 *       const viewer = await requireViewer();
 *       const { id } = await createPost(getDb(), viewer.id, { … });
 *       revalidatePath("/home");
 *       return { id };
 *     });
 *   }
 *
 * or wrap a whole function with `action(fn)`.
 */
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { isCoreError } from "@/core/errors";

export type ActionOk<T extends object = object> = { ok: true } & T;
export type ActionFail = { ok: false; error: string };
export type ActionResult<T extends object = object> = ActionOk<T> | ActionFail;

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Run an action body. A CoreError becomes `{ ok: false, error: message }`;
 * Next's redirect and notFound pass through; anything else is logged and
 * becomes a generic sentence, so no internal detail reaches the page.
 */
export async function run<T extends object = object>(
  body: () => Promise<T | void>,
): Promise<ActionResult<T>> {
  try {
    const value = await body();
    // `ok` last, so a body's own fields can never turn a failure into a
    // success or the other way round.
    return { ...(value ?? {}), ok: true } as ActionOk<T>;
  } catch (error) {
    unstable_rethrow(error);
    if (isCoreError(error)) {
      return { ok: false, error: error.message };
    }
    // Never the message or the whole error: a database error can carry a
    // person's address or the database's host (the verification of M-0018).
    console.error("[ours] action failed:", error instanceof Error ? error.name : "unknown error");
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Wrap a server action body so it always returns an ActionResult. */
export function action<Args extends unknown[], T extends object = object>(
  fn: (...args: Args) => Promise<T | void>,
): (...args: Args) => Promise<ActionResult<T>> {
  return async (...args: Args) => run(() => fn(...args));
}

/**
 * Run `task` after the response has been sent, with Next's `after` (SPEC
 * §17 item 4). Pass it as `defer` to the core's `requestSignIn` and
 * `requestJoin`: the request then does the same work whether or not an
 * account exists, and whether or not mail is sent.
 *
 * A failure in the task is logged; the person already has their answer.
 * Outside a request (a script, or a test calling an action directly) there
 * is no response to wait for and `after` refuses; the task then runs now,
 * and the returned promise is awaited by the core.
 */
export function afterResponse(task: () => Promise<void>): void | Promise<void> {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      // Never the message: it can carry an address (the verification of M-0018).
      console.error("[ours] work after the response failed:", error instanceof Error ? error.name : "unknown error");
    }
  };
  try {
    after(guarded);
  } catch {
    return guarded();
  }
}
