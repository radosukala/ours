"use client";

/**
 * Edit your name, username and bio (SPEC §5 limits). The server checks
 * everything again; the limits here only help while typing. The fields
 * keep what was typed when the server refuses it.
 */
import { type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Field, TextAreaField } from "@/components/Field";
import type { ActionResult } from "@/web/actions";

const BIO_MAX = 160;

function chars(value: string): number {
  return Array.from(value).length;
}

export function ProfileForm({
  initial,
  action,
}: {
  initial: { displayName: string; handle: string; bio: string };
  action: (form: FormData) => Promise<ActionResult<{ handle: string }>>;
}) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [handle, setHandle] = useState(initial.handle);
  const [bio, setBio] = useState(initial.bio);
  const [result, setResult] = useState<ActionResult<{ handle: string }> | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const outcome = await action(form);
      if (outcome.ok) setHandle(outcome.handle);
      setResult(outcome);
    });
  }

  const bioLeft = BIO_MAX - chars(bio);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field
        label="Name"
        name="displayName"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={50}
        autoComplete="nickname"
        required
      />
      <Field
        label="Username"
        name="handle"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        maxLength={21}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        hint={`3–20 characters: letters a–z, numbers and underscores. Your profile is at /@${handle.replace(/^@/, "").toLowerCase() || "…"}.`}
      />
      <TextAreaField
        label="Bio"
        name="bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        hint={
          bioLeft >= 0
            ? `${bioLeft} characters left.`
            : `${-bioLeft} characters too many.`
        }
      />
      {result && !result.ok ? (
        <p className="notice notice--error" role="alert">
          {result.error}
        </p>
      ) : null}
      {result?.ok && !pending ? (
        <p className="notice notice--ok" role="status">
          Saved.
        </p>
      ) : null}
      <div>
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
