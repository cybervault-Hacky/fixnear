'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Flag, LoaderCircle, Star } from 'lucide-react';

import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminErrorState, AdminLoadingState } from '@/features/admin/components/AdminShell';
import {
  adminErrorMessage,
  formatDateTime,
  isForbidden,
} from '@/features/admin/components/admin-errors';
import {
  hideReview,
  listAdminReviews,
  listReports,
  resolveReport,
  restoreReview,
} from '@/lib/api/reviews';
import type { AdminReview, ReviewReport } from '@/lib/api/reviews';

const PAGE_SIZE = 20;
type Tab = 'published' | 'hidden' | 'reports';

const TAB_LABELS: Record<Tab, string> = {
  published: 'Published',
  hidden: 'Hidden',
  reports: 'Report queue',
};

const REPORT_REASON_LABELS: Record<ReviewReport['reason'], string> = {
  spam: 'Spam',
  abuse: 'Abuse',
  harassment: 'Harassment',
  privacy: 'Privacy violation',
  off_topic: 'Off topic',
  fraud: 'Fraud',
  other: 'Other',
};

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          aria-hidden="true"
          className={value <= rating ? 'fill-[#d9a521] text-[#d9a521]' : 'text-midnight/20'}
        />
      ))}
    </span>
  );
}

export function AdminReviewsPage() {
  const [tab, setTab] = useState<Tab>('published');
  const [page, setPage] = useState(0);
  const [reviews, setReviews] = useState<{ items: AdminReview[]; total: number } | null>(null);
  const [reports, setReports] = useState<{ items: ReviewReport[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonMode, setReasonMode] = useState<'hide' | 'restore' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    setActionMessage('');
    const handle = (requestError: unknown) => {
      setForbidden(isForbidden(requestError));
      setError(adminErrorMessage(requestError, 'The review data could not be loaded.'));
      setReviews(null);
      setReports(null);
    };
    if (tab === 'reports') {
      listReports({ status: 'open', limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        .then((result) => setReports(result))
        .catch(handle)
        .finally(() => setLoading(false));
    } else {
      listAdminReviews({ status: tab, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        .then((result) => setReviews(result))
        .catch(handle)
        .finally(() => setLoading(false));
    }
  }, [tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  const currentTotal = tab === 'reports' ? (reports?.total ?? 0) : (reviews?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));

  const beginReason = (reviewId: string, mode: 'hide' | 'restore') => {
    setActiveReviewId(reviewId);
    setReasonMode(mode);
    setReason('');
    setActionError('');
    setActionMessage('');
  };

  const submitReason = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeReviewId || !reasonMode) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setActionError(
        'Provide a reason of at least 10 characters. It is recorded in the audit log.',
      );
      return;
    }
    setActionBusy(true);
    setActionError('');
    const action =
      reasonMode === 'hide'
        ? hideReview(activeReviewId, trimmed)
        : restoreReview(activeReviewId, trimmed);
    action
      .then(() => {
        setActionMessage(
          reasonMode === 'hide'
            ? 'Review hidden. Its content is preserved and the decision is audited.'
            : 'Review restored to public view. The decision is audited.',
        );
        setActiveReviewId(null);
        setReasonMode(null);
        setReason('');
        load();
      })
      .catch((requestError: unknown) => setActionError(adminErrorMessage(requestError)))
      .finally(() => setActionBusy(false));
  };

  const resolveReportAction = (reportId: string, resolution: 'reviewed' | 'dismissed') => {
    setActionError('');
    resolveReport(reportId, resolution)
      .then(() => {
        setActionMessage(`Report marked as ${resolution}.`);
        load();
      })
      .catch((requestError: unknown) => setActionError(adminErrorMessage(requestError)));
  };

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin"
        title="Review moderation"
        description="Hide or restore verified customer reviews under documented moderation rules. Original content is never edited; every decision requires a reason and is written to the audit log."
      />

      <div role="tablist" aria-label="Review queues" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setPage(0);
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold ${
              tab === value
                ? 'border-midnight bg-midnight text-white'
                : 'border-midnight/15 bg-white text-midnight/75 hover:text-midnight'
            }`}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
      </div>

      {actionMessage ? (
        <p
          role="status"
          className="mb-3 rounded-xl border border-[#cbe7ae] bg-[#eef7e5] px-4 py-2 text-xs font-semibold text-midnight"
        >
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-2 text-xs font-semibold text-[#8d3028]"
        >
          {actionError}
        </p>
      ) : null}

      {loading ? <AdminLoadingState label="Loading reviews…" /> : null}
      {error && forbidden ? <AdminErrorState message={error} /> : null}
      {error && !forbidden ? <AdminErrorState message={error} onRetry={load} /> : null}

      {tab !== 'reports' && reviews && !loading && !error ? (
        reviews.items.length === 0 ? (
          <p className="text-sm text-midnight/55">No {tab} reviews found.</p>
        ) : (
          <ul className="grid gap-4">
            {reviews.items.map((review) => (
              <li
                key={review.id}
                className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Stars rating={review.rating} />
                    <span className="text-xs font-semibold text-midnight/70">
                      {review.technician_display_name}
                    </span>
                    {review.report_count > 0 ? (
                      <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-[#fff4d8] px-2.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[#72510b]">
                        <Flag size={12} aria-hidden="true" /> {review.report_count} report
                        {review.report_count === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[0.7rem] tabular-nums text-midnight/50">
                    {formatDateTime(review.created_at)} · {review.customer_label}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-midnight/85">{review.feedback}</p>
                {activeReviewId === review.id && reasonMode ? (
                  <form
                    onSubmit={submitReason}
                    className="mt-3 rounded-xl border border-midnight/12 bg-[#fbfcf9] p-3"
                  >
                    <label
                      htmlFor={`moderation-reason-${review.id}`}
                      className="text-xs font-semibold text-midnight"
                    >
                      Reason for {reasonMode === 'hide' ? 'hiding' : 'restoring'} this review (min
                      10 characters)
                    </label>
                    <textarea
                      id={`moderation-reason-${review.id}`}
                      required
                      minLength={10}
                      maxLength={500}
                      rows={2}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-midnight/15 bg-white p-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={actionBusy}
                        className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-midnight px-4 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {actionBusy ? (
                          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                        ) : null}
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveReviewId(null)}
                        className="inline-flex min-h-9 items-center rounded-xl border border-midnight/15 px-4 text-xs font-semibold text-midnight"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.status === 'published' ? (
                      <button
                        type="button"
                        onClick={() => beginReason(review.id, 'hide')}
                        className="inline-flex min-h-9 items-center rounded-xl border border-[#d99b93] px-4 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1]"
                      >
                        Hide review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginReason(review.id, 'restore')}
                        className="inline-flex min-h-9 items-center rounded-xl border border-midnight/15 px-4 text-xs font-semibold text-midnight hover:bg-[#f4f6f8]"
                      >
                        Restore review
                      </button>
                    )}
                  </div>
                )}
                {review.status === 'hidden' && review.hidden_reason ? (
                  <p className="mt-2 text-[0.7rem] leading-4 text-midnight/50">
                    Hidden: {review.hidden_reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'reports' && reports && !loading && !error ? (
        reports.items.length === 0 ? (
          <p className="text-sm text-midnight/55">
            No open reports. The moderation queue is clear.
          </p>
        ) : (
          <ul className="grid gap-4">
            {reports.items.map((report) => (
              <li
                key={report.id}
                className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[#fff4d8] px-3 text-xs font-semibold text-[#72510b]">
                    <Flag size={12} aria-hidden="true" /> {REPORT_REASON_LABELS[report.reason]}
                  </span>
                  <span className="text-[0.7rem] tabular-nums text-midnight/50">
                    {formatDateTime(report.created_at)} · review {report.review_id.slice(0, 8)}…
                  </span>
                </div>
                {report.note ? (
                  <p className="mt-2 text-sm leading-6 text-midnight/85">{report.note}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => resolveReportAction(report.id, 'reviewed')}
                    className="inline-flex min-h-9 items-center rounded-xl border border-midnight/15 bg-white px-4 text-xs font-semibold text-midnight hover:bg-[#f4f6f8]"
                  >
                    Mark reviewed
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveReportAction(report.id, 'dismissed')}
                    className="inline-flex min-h-9 items-center rounded-xl border border-midnight/15 bg-white px-4 text-xs font-semibold text-midnight/60 hover:text-midnight"
                  >
                    Dismiss report
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {currentTotal > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between text-xs text-midnight/60">
          <span className="tabular-nums">
            {currentTotal} total · page {page + 1} of {totalPages}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-midnight/15 disabled:opacity-40"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages}
              aria-label="Next page"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-midnight/15 disabled:opacity-40"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </span>
        </div>
      ) : null}
    </>
  );
}
