/**
 * /report?kind=post|reply|account&id=… (SPEC §8): the item as the reporter
 * already sees it, a reason, optional details, then "Thanks. A person will
 * look at this."
 *
 * Anything the viewer cannot see, and anything that does not exist, is the
 * same not-found page. Your own post, reply or account says plainly that it
 * can't be reported.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ReportedItem } from "@/components/safety/ReportedItem";
import { ReportForm } from "@/components/safety/ReportForm";
import { getDb } from "@/core/db";
import { isCoreError } from "@/core/errors";
import {
  reportTargetPreview,
  type ReportTargetPreview,
} from "@/core/reports";
import { requireViewer } from "@/web/viewer";
import { submitReport } from "./actions";

export const metadata: Metadata = { title: "Report" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

type Found =
  | { kind: "ok"; target: ReportTargetPreview }
  | { kind: "own"; message: string }
  | { kind: "none" };

async function find(viewerId: string, kind: string, id: string): Promise<Found> {
  try {
    const target = await reportTargetPreview(getDb(), viewerId, {
      kind,
      targetId: id,
    });
    return { kind: "ok", target };
  } catch (error) {
    if (isCoreError(error)) {
      if (error.code === "FORBIDDEN" && id) {
        return { kind: "own", message: error.message };
      }
      if (error.code === "NOT_FOUND" || error.code === "INVALID") {
        return { kind: "none" };
      }
    }
    throw error;
  }
}

/** Where the person came from: the post, or the profile. */
function backHref(target: ReportTargetPreview): string {
  switch (target.kind) {
    case "post":
      return `/p/${encodeURIComponent(target.id)}`;
    case "reply":
      return `/p/${encodeURIComponent(target.postId)}`;
    case "account":
      return `/@${encodeURIComponent(target.handle)}`;
  }
}

const TITLE = {
  post: "Report post",
  reply: "Report reply",
  account: "Report account",
} as const;

const QUOTE_LABEL = {
  post: "The post you're reporting",
  reply: "The reply you're reporting",
  account: "The account you're reporting",
} as const;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const found = await find(viewer.id, one(params.kind), one(params.id));

  if (found.kind === "none") notFound();

  if (found.kind === "own") {
    return (
      <>
        <PageHeader title="Report" back="/home" />
        <EmptyState
          text={found.message}
          action={{ href: "/home", label: "Go home" }}
        />
      </>
    );
  }

  const { target } = found;
  const back = backHref(target);
  return (
    <>
      <PageHeader title={TITLE[target.kind]} back={back} />
      <ReportedItem item={target} label={QUOTE_LABEL[target.kind]} />
      <ReportForm
        action={submitReport}
        kind={target.kind}
        targetId={target.id}
        doneHref={back}
      />
    </>
  );
}
