/**
 * /settings (SPEC §8): your profile, who can follow you, the weekly email,
 * your data, signing out, and leaving.
 */
import type { Metadata } from "next";
import { getSettings } from "@/core/accounts";
import { getDb } from "@/core/db";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { SettingsLinks } from "@/components/settings/SettingsLinks";
import styles from "@/components/settings/settings.module.css";
import { SwitchSetting } from "@/components/settings/SwitchSetting";
import { requireViewer } from "@/web/viewer";
import {
  saveProfileAction,
  setAcceptsFollowersAction,
  setWeeklyEmailAction,
  signOutAction,
  signOutEverywhereAction,
} from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const settings = await getSettings(getDb(), viewer.id);

  return (
    <>
      <PageHeader title="Settings" />

      <section className="section stack" aria-labelledby="settings-profile">
        <h2 id="settings-profile" className={styles.heading}>
          Your profile
        </h2>
        <ProfileForm
          initial={{
            displayName: settings.displayName,
            handle: settings.handle,
            bio: settings.bio,
          }}
          action={saveProfileAction}
        />
      </section>

      <section className="section stack" aria-labelledby="settings-followers">
        <h2 id="settings-followers" className={styles.heading}>
          Followers
        </h2>
        <SwitchSetting
          label="Accept followers"
          description="People who aren't your friends can follow you and see the posts you share with friends & followers. Friends always see your posts."
          checked={settings.acceptsFollowers}
          action={setAcceptsFollowersAction}
          confirmOff={{
            text: "Turning this off removes everyone who follows you. Posts you shared with friends & followers will be seen by friends only. If you turn it on again, people have to follow you again.",
            confirm: "Turn off and remove followers",
          }}
        />
      </section>

      <section className="section stack" aria-labelledby="settings-email">
        <h2 id="settings-email" className={styles.heading}>
          Email
        </h2>
        <p className={styles.intro}>
          You sign in with links sent to{" "}
          <strong className={styles.email}>{settings.email}</strong>.
        </p>
        <SwitchSetting
          label="Weekly email"
          description="Once a week, the names of people who posted. It doesn't include what they wrote."
          checked={settings.weeklyEmail}
          action={setWeeklyEmailAction}
        />
      </section>

      <section aria-labelledby="settings-data">
        <div className={styles.sectionHeader}>
          <h2 id="settings-data" className={styles.heading}>
            Your data
          </h2>
        </div>
        <SettingsLinks
          items={[
            {
              href: "/settings/export",
              download: true,
              title: "Download your data",
              description:
                "A JSON file with your account, your posts and replies (removed ones too, with the reasons), the posts you liked, your friends, who you follow and who follows you, who you blocked or muted, and your invites. It doesn't include other people's posts or email addresses.",
            },
            {
              href: "/settings/blocked",
              title: "Blocked and muted",
              description: "See who you've blocked or muted, and undo it.",
            },
            {
              href: `/@${settings.handle}`,
              title: "Your profile",
              description: "See your profile as your friends do.",
            },
          ]}
        />
      </section>

      <section className="section stack" aria-labelledby="settings-signout">
        <h2 id="settings-signout" className={styles.heading}>
          Sign out
        </h2>
        <p className={styles.intro}>
          Sign out everywhere ends every session, on this device and any other.
        </p>
        <div className="cluster">
          <form action={signOutAction}>
            <Button type="submit" kind="outline">
              Sign out
            </Button>
          </form>
          <form action={signOutEverywhereAction}>
            <Button type="submit" kind="outline">
              Sign out everywhere
            </Button>
          </form>
        </div>
      </section>

      <section aria-labelledby="settings-leave">
        <div className={styles.sectionHeader}>
          <h2 id="settings-leave" className={styles.heading}>
            Leave OURS
          </h2>
        </div>
        <SettingsLinks
          items={[
            {
              href: "/settings/delete",
              danger: true,
              title: "Delete your account",
              description:
                "Deletes your account and everything you posted. It can't be undone.",
            },
          ]}
        />
      </section>

      {/* The version and the footer links, reachable on phones (SPEC §17 item 20). */}
      <InAppSiteFooter />
    </>
  );
}
