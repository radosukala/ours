/**
 * /admin (SPEC §8): open reports, oldest first, each with the reported item
 * and the reporter's handle, and the decisions Remove, Suspend account and
 * Dismiss. Anyone who is not an administrator gets the not-found page, the
 * same as for a page that does not exist.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { RelativeTime } from "@/components/RelativeTime";
import { ModerationActions } from "@/components/safety/ModerationActions";
import { ReportedItem } from "@/components/safety/ReportedItem";
import styles from "@/components/safety/safety.module.css";
import { getDb } from "@/core/db";
import { isCoreError } from "@/core/errors";
import {
  categoryLabel,
  listOpenReports,
  NOTE_MAX,
  type OpenReport,
  REASON_MAX,
  REASON_MIN,
  REPORT_CATEGORY_LABELS,
} from "@/core/reports";
import { REPORT_CATEGORIES } from "@/core/schema";
import { requireViewer } from "@/web/viewer";
import { dismissReported, removeReported, suspendReported } from "./actions";

export const metadata: Metadata = { title: "Reports" };

async function openReports(adminId: string): Promise<OpenReport[] | null> {
  try {
    return await listOpenReports(getDb(), adminId);
  } catch (error) {
    if (isCoreError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

const CATEGORY_OPTIONS = REPORT_CATEGORIES.map((value) => ({
  value,
  label: REPORT_CATEGORY_LABELS[value],
}));

const LIMITS = { reasonMin: REASON_MIN, reasonMax: REASON_MAX, noteMax: NOTE_MAX };

const ACTIONS = {
  remove: removeReported,
  suspend: suspendReported,
  dismiss: dismissReported,
};

const NOUN = {
  post: "post",
  reply: "reply",
  account: "account",
  gone: "item",
} as const;

const WHAT = {
  post: "A post",
  reply: "A reply",
  account: "An account",
  gone: "Deleted",
} as const;

/** The account a suspension would reach, and whether it already is. */
function reportedAccount(
  target: OpenReport["target"],
): { id: string; suspended: boolean } | null {
  switch (target.kind) {
    case "post":
    case "reply":
      return target.author;
    case "account":
      return target;
    case "gone":
      return null;
  }
}

function ReportEntry({
  report,
  viewerId,
}: {
  report: OpenReport;
  viewerId: string;
}) {
  const { target } = report;
  const noun = NOUN[target.kind];
  const account = reportedAccount(target);
  // Not offered for a deleted item, an account already suspended, or the
  // administrator's own account (the core refuses that too).
  const canSuspend =
    account !== null && !account.suspended && account.id !== viewerId;
  return (
    <article
      className={styles.report}
      aria-label={`${categoryLabel(report.category)} report`}
    >
      <div className={styles.meta}>
        <span className="status">{categoryLabel(report.category)}</span>
        <span>
          {WHAT[target.kind]}, reported by{" "}
          {report.reporterHandle ? `@${report.reporterHandle}` : "a deleted account"}{" "}
          · <RelativeTime date={report.createdAt} />
        </span>
      </div>
      {report.details ? (
        <p className={styles.details}>{report.details}</p>
      ) : null}
      <ReportedItem item={target} label={`The reported ${noun}`} />
      <ModerationActions
        reportId={report.id}
        noun={noun}
        canRemove={target.kind === "post" || target.kind === "reply"}
        canSuspend={canSuspend}
        categories={CATEGORY_OPTIONS}
        defaultCategory={report.category}
        limits={LIMITS}
        actions={ACTIONS}
      />
    </article>
  );
}

export default async function AdminPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const reports = await openReports(viewer.id);
  if (!reports) notFound();

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={reports.length === 1 ? "1 open" : `${reports.length} open`}
      />
      <p className={styles.intro}>
        Oldest first. A reported item shows here whatever its audience, so it
        can be judged. Each decision records who made it and when.
      </p>
      {reports.length === 0 ? (
        <EmptyState text="No open reports." />
      ) : (
        reports.map((report) => (
          <ReportEntry key={report.id} report={report} viewerId={viewer.id} />
        ))
      )}
    </>
  );
}
