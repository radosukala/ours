/**
 * /settings/delete (SPEC §8): type your username to confirm.
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { DeleteAccountForm } from "@/components/settings/DeleteAccountForm";
import styles from "@/components/settings/settings.module.css";
import { requireViewer } from "@/web/viewer";
import { deleteAccountAction } from "./actions";

export const metadata: Metadata = { title: "Delete your account" };

export default async function DeleteAccountPage() {
  const viewer = await requireViewer();

  return (
    <>
      <PageHeader title="Delete your account" back="/settings" />
      <section className="section stack" aria-labelledby="delete-what">
        <h2 id="delete-what" className={styles.heading}>
          What deleting removes
        </h2>
        <p>
          Your account, and with it your posts, your replies and your likes;
          your friends, who you follow and who follows you; the people you
          blocked or muted; your invites, your notifications and your friend
          requests. Replies other people wrote on your posts go with the
          posts.
        </p>
        <p>
          It happens at once and can&apos;t be undone. You&apos;ll be signed
          out on every device.
        </p>
        <p className={styles.intro}>
          If you reported something, the report stays for the moderator, but
          it no longer says who made it.
        </p>
        <p>
          Before you go, you can{" "}
          <a className="link" href="/settings/export" download>
            download your data
          </a>
          .
        </p>
      </section>
      <section className="section" aria-label="Confirm">
        <DeleteAccountForm handle={viewer.handle} action={deleteAccountAction} />
      </section>
    </>
  );
}
