/**
 * One sentence and one action (SPEC §9), e.g. "Your feed is quiet. Invite
 * someone you know." with Invite.
 */
import { LinkButton } from "./Button";

export function EmptyState({
  text,
  action,
}: {
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty">
      <p className="empty__text">{text}</p>
      {action ? (
        <LinkButton href={action.href} kind="primary">
          {action.label}
        </LinkButton>
      ) : null}
    </div>
  );
}
