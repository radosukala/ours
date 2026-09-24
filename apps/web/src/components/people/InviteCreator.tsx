"use client";

/**
 * Create an invite link (SPEC §8 "Invites"): an optional private note, then
 * the link, shown once, with Copy and — on devices that can — Share, whose
 * text is "Connect with me on OURS". Only a hash of the code is kept, so
 * the link cannot be shown again after you leave the page.
 */
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createInviteAction, type CreateInviteState } from "@/app/(app)/people/actions";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import styles from "./people.module.css";

export const SHARE_TEXT = "Connect with me on OURS";

const noSubscription = () => () => {};

export function InviteCreator({ remaining }: { remaining: number }) {
  const [state, formAction, pending] = useActionState<CreateInviteState, FormData>(
    createInviteAction,
    null,
  );
  const created = state?.ok ? state : null;
  const error = state && !state.ok ? state.error : null;

  return (
    <div className="stack">
      {created ? <InviteLink key={created.url} url={created.url} /> : null}
      <form action={formAction} className="form">
        <Field
          label="Note (optional)"
          name="note"
          maxLength={40}
          autoComplete="off"
          placeholder="for Anna"
          hint="Only you see this, to remember who the link was for."
          error={error}
        />
        <div>
          <Button type="submit" kind="primary" disabled={pending || remaining <= 0}>
            {pending ? "Creating…" : "Create invite link"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function InviteLink({ url }: { url: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  // False on the server and during hydration: only the browser knows
  // whether the device can share.
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    input.current?.select();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard permission: select the text so the person can copy it.
      input.current?.focus();
      input.current?.select();
      setSelectedOnly(true);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "OURS", text: SHARE_TEXT, url });
    } catch {
      // Cancelled, or not allowed: nothing to do.
    }
  }

  return (
    <section className={styles.inviteLink} aria-labelledby="invite-link-title">
      <h2 id="invite-link-title" className={styles.inviteLinkTitle}>
        Your invite link
      </h2>
      <p className="small muted">
        It works once, for 30 days. It&apos;s shown only now: copy it or share it
        before you leave this page.
      </p>
      <label htmlFor="invite-link-url" className="visually-hidden">
        Invite link
      </label>
      <input
        id="invite-link-url"
        ref={input}
        className={`input ${styles.inviteLinkUrl}`}
        value={url}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="cluster">
        <Button type="button" kind="primary" size="small" onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={18} />
          {copied ? "Copied" : "Copy"}
        </Button>
        {canShare ? (
          <Button type="button" kind="outline" size="small" onClick={share}>
            <Icon name="share" size={18} />
            Share
          </Button>
        ) : null}
      </div>
      <p className={selectedOnly && !copied ? "small muted" : "visually-hidden"} role="status">
        {copied
          ? "Link copied."
          : selectedOnly
            ? "The link is selected: copy it with your device's copy command."
            : ""}
      </p>
    </section>
  );
}
