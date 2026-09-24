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
    console.error("[ours] action failed:", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Wrap a server action body so it always returns an ActionResult. */
export function action<Args extends unknown[], T extends object = object>(
  fn: (...args: Args) => Promise<T | void>,
): (...args: Args) => Promise<ActionResult<T>> {
  return async (...args: Args) => run(() => fn(...args));
}
