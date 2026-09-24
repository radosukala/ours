/**
 * The profile header (SPEC §6 "Profiles", §8 "Profile actions"): display
 * name, handle, bio, the relationship between viewer and profile, and the
 * actions by state:
 *
 * - Add friend → Requested (a menu with Cancel request) → Friends (a menu
 *   with Unfriend); Accept / Decline when they asked you;
 * - Follow / Following, only if the profile accepts followers;
 * - a ⋯ menu with Mute / Unmute, Block / Unblock and Report.
 *
 * No counts of friends or followers are shown (not even to the owner here).
 * `relationship.blockedBy` is never shown: a person who blocked you gets
 * a not-found page before this renders (SPEC §2 rule 3).
 *
 * The page (M3's /u/[handle]) decides whether the profile may be seen at
 * all; this component only renders what it is given.
 */
import {
  acceptFriendRequestAction,
  blockAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  followAction,
  muteAction,
  sendFriendRequestAction,
  unblockAction,
  unfollowAction,
  unfriendAction,
  unmuteAction,
} from "@/app/(app)/people/actions";
import { Avatar } from "@/components/Avatar";
import { LinkButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ActionButton } from "@/components/people/ActionButton";
import { ActionMenu, type MenuItem } from "@/components/people/ActionMenu";
import styles from "@/components/people/people.module.css";
import type { Relationship } from "@/core/visibility";

export type ProfileHeaderProps = {
  profile: { id: string; handle: string; displayName: string; bio: string };
  relationship: Relationship;
  isSelf: boolean;
};

/** Where the Report item goes (M4's route). */
export function reportAccountHref(accountId: string): string {
  return `/report?kind=account&id=${encodeURIComponent(accountId)}`;
}

/** The words under the handle: what is between you, in plain words. */
export function relationshipWords(r: Relationship): string[] {
  const words: string[] = [];
  if (r.blocked) return ["You blocked this person"];
  if (r.friends) words.push("Friends");
  else if (r.requestIn) words.push("Wants to be friends");
  else if (r.requestOut) words.push("Friend request sent");
  if (r.followedBy) words.push("Follows you");
  if (r.muted) words.push("Muted");
  return words;
}

export function ProfileHeader({ profile, relationship: r, isSelf }: ProfileHeaderProps) {
  const self = isSelf || r.self;
  const name = profile.displayName;
  const words = self ? [] : relationshipWords(r);

  return (
    <section className="profile" aria-labelledby="profile-name">
      <div className={styles.profileHead}>
        <Avatar name={name} handle={profile.handle} size={80} />
        {self ? (
          <LinkButton href="/settings" kind="outline" size="small">
            Edit profile
          </LinkButton>
        ) : (
          <MoreMenu profile={profile} r={r} />
        )}
      </div>

      <div className={styles.profileNames}>
        <h2 id="profile-name" className="profile__name">
          {name}
        </h2>
        <p className="profile__handle">@{profile.handle}</p>
      </div>

      {profile.bio ? <p className="profile__bio">{profile.bio}</p> : null}

      {words.length > 0 ? (
        <p className="profile__relationship">{words.join(" · ")}</p>
      ) : null}

      {self ? null : <Actions profile={profile} r={r} />}
    </section>
  );
}

function Actions({
  profile,
  r,
}: {
  profile: ProfileHeaderProps["profile"];
  r: Relationship;
}) {
  const id = profile.id;
  const name = profile.displayName;

  if (r.blocked) {
    return (
      <div className={styles.profileActions}>
        <ActionButton action={unblockAction.bind(null, id)} pendingLabel="Unblocking…">
          Unblock
        </ActionButton>
      </div>
    );
  }

  let friendship: React.ReactNode;
  if (r.friends) {
    friendship = (
      <ActionMenu
        align="start"
        triggerClassName="btn btn--outline btn--small"
        trigger={
          <>
            <Icon name="check" size={16} />
            Friends
          </>
        }
        items={[
          {
            kind: "action",
            label: "Unfriend",
            danger: true,
            action: unfriendAction.bind(null, id),
            confirm: `Unfriend ${name}? You'll stop seeing each other's friends-only posts. Being friends again needs a new request.`,
          },
        ]}
      />
    );
  } else if (r.requestIn) {
    friendship = (
      <>
        <ActionButton
          kind="primary"
          action={acceptFriendRequestAction.bind(null, id)}
          pendingLabel="Accepting…"
        >
          Accept request
        </ActionButton>
        <ActionButton action={declineFriendRequestAction.bind(null, id)} pendingLabel="Declining…">
          Decline
        </ActionButton>
      </>
    );
  } else if (r.requestOut) {
    friendship = (
      <ActionMenu
        align="start"
        triggerClassName="btn btn--outline btn--small"
        trigger="Requested"
        items={[
          {
            kind: "action",
            label: "Cancel request",
            action: cancelFriendRequestAction.bind(null, id),
          },
        ]}
      />
    );
  } else {
    friendship = (
      <ActionButton
        kind="primary"
        action={sendFriendRequestAction.bind(null, id)}
        pendingLabel="Sending…"
      >
        Add friend
      </ActionButton>
    );
  }

  return (
    <div className={styles.profileActions}>
      {friendship}
      {r.acceptsFollowers ? (
        r.following ? (
          <ActionButton
            action={unfollowAction.bind(null, id)}
            pressed={true}
            pendingLabel="Unfollowing…"
          >
            Following
          </ActionButton>
        ) : (
          <ActionButton
            action={followAction.bind(null, id)}
            pressed={false}
            pendingLabel="Following…"
          >
            Follow
          </ActionButton>
        )
      ) : null}
    </div>
  );
}

function MoreMenu({
  profile,
  r,
}: {
  profile: ProfileHeaderProps["profile"];
  r: Relationship;
}) {
  const id = profile.id;
  const at = `@${profile.handle}`;
  const items: MenuItem[] = [
    r.muted
      ? {
          kind: "action",
          label: `Unmute ${at}`,
          action: unmuteAction.bind(null, id),
        }
      : {
          kind: "action",
          label: `Mute ${at}`,
          action: muteAction.bind(null, id),
        },
    r.blocked
      ? {
          kind: "action",
          label: `Unblock ${at}`,
          action: unblockAction.bind(null, id),
        }
      : {
          kind: "action",
          label: `Block ${at}`,
          danger: true,
          // A blocked profile is not found, so go home afterwards.
          action: blockAction.bind(null, id, "/home"),
          confirm: `Block ${at}? You won't see each other's posts, and neither of you can reach the other. Your friendship and follows between you end. They aren't told.`,
        },
    {
      kind: "link",
      label: `Report ${at}`,
      href: reportAccountHref(id),
    },
  ];
  return (
    <ActionMenu
      label={`More options for ${at}`}
      trigger={<Icon name="dots" size={20} />}
      items={items}
    />
  );
}
