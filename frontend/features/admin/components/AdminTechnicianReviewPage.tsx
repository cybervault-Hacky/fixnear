'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { FixNearApiError } from '@/lib/api/client';
import {
  getAdminTechnician,
  listAdminTechnicians,
  reviewAdminTechnician,
} from '@/lib/api/technician-management';
import type {
  AdminTechnician,
  AdminTechnicianDetail,
  TechnicianVerificationStatus,
} from '@/lib/api/technician-management';

const filters: { label: string; value: TechnicianVerificationStatus | 'all' }[] = [
  { label: 'Pending review', value: 'pending_review' },
  { label: 'Not submitted', value: 'not_submitted' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All technicians', value: 'all' },
];

function readableStatus(status: TechnicianVerificationStatus): string {
  const names: Record<TechnicianVerificationStatus, string> = {
    not_submitted: 'Not submitted',
    pending_review: 'Pending review',
    approved: 'Approved by admin',
    rejected: 'Rejected by admin',
  };
  return names[status];
}

function messageFor(error: unknown): string {
  if (error instanceof FixNearApiError) {
    if (error.status === 401) return 'Sign in with an active FixNear account to continue.';
    if (error.status === 403) return 'This operation requires the server-managed admin role.';
    if (error.status === 503)
      return 'The database API is not configured or is temporarily unavailable.';
    return error.message;
  }
  return 'The technician review API could not be reached.';
}

export function AdminTechnicianReviewPage() {
  const [filter, setFilter] = useState<TechnicianVerificationStatus | 'all'>('pending_review');
  const [queue, setQueue] = useState<AdminTechnician[]>([]);
  const [selected, setSelected] = useState<AdminTechnicianDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const loadQueue = async (currentFilter: TechnicianVerificationStatus | 'all') => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await listAdminTechnicians(
        currentFilter === 'all' ? undefined : currentFilter,
      );
      setQueue(result);
      setSelected((current) => {
        if (!current) return current;
        return result.some((technician) => technician.user_id === current.user_id) ? current : null;
      });
    } catch (error) {
      setQueue([]);
      setSelected(null);
      setLoadError(messageFor(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue(filter);
  }, [filter]);

  const selectTechnician = async (technician: AdminTechnician) => {
    setSelected(null);
    setDetailLoading(true);
    setReviewNote('');
    setActionError('');
    try {
      const detail = await getAdminTechnician(technician.user_id);
      setSelected(detail);
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!selected) return;
    if (decision === 'rejected' && !reviewNote.trim()) {
      setActionError('Add a concise reason before rejecting a verification request.');
      return;
    }
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      await reviewAdminTechnician(selected.user_id, {
        decision,
        note: reviewNote.trim(),
      });
      const updated = await getAdminTechnician(selected.user_id);
      setReviewNote('');
      setFeedback(
        decision === 'approved'
          ? 'Admin review recorded as approved.'
          : 'Admin review recorded as rejected.',
      );
      await loadQueue(filter);
      setSelected(updated);
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const accessBlocked = Boolean(loadError) && queue.length === 0;

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin · private technician review"
        title="Review technician submissions."
        description="Review the private account profile and self-reported skills and coverage. Only authorized admins can decide a pending request. This foundation does not collect identity documents or create public verification badges."
      />

      {actionError ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
        >
          {actionError}
        </p>
      ) : null}
      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-5 rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-midnight"
        >
          {feedback}
        </p>
      ) : null}

      {accessBlocked ? (
        <DashboardCard title="Admin access required" description={loadError} icon={AlertCircle}>
          <p className="text-sm leading-6 text-midnight/65">
            Private technician data is not displayed until the API confirms an authorized admin
            account.
          </p>
        </DashboardCard>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <DashboardCard
            title="Verification queue"
            description="Only server-managed technician records are listed here."
            icon={Clock3}
          >
            <div className="grid gap-2">
              <label
                htmlFor="verification-filter"
                className="text-xs font-semibold text-midnight/60"
              >
                Filter by status
              </label>
              <select
                id="verification-filter"
                value={filter}
                onChange={(event) =>
                  setFilter(event.currentTarget.value as TechnicianVerificationStatus | 'all')
                }
                className="min-h-11 w-full rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              >
                {filters.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            {loading ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-midnight/60">
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                  size={16}
                />{' '}
                Loading queue…
              </div>
            ) : queue.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm leading-6 text-midnight/60">
                No technician records match this status.
              </p>
            ) : (
              <ul className="mt-5 grid gap-2">
                {queue.map((technician) => (
                  <li key={technician.user_id}>
                    <button
                      type="button"
                      onClick={() => void selectTechnician(technician)}
                      aria-current={selected?.user_id === technician.user_id ? 'true' : undefined}
                      className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${selected?.user_id === technician.user_id ? 'border-midnight/35 bg-[#f8faf7]' : 'border-midnight/10 bg-white hover:bg-[#f8faf7]'}`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-semibold text-midnight">
                            {technician.display_name}
                          </span>
                          <span className="mt-1 block break-all text-xs text-midnight/55">
                            {technician.email ?? 'No email supplied'}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#f1f3f5] px-2.5 py-1 text-[0.62rem] font-semibold text-midnight/60">
                          {readableStatus(technician.verification_status)}
                        </span>
                      </span>
                      <span className="mt-3 block text-xs leading-5 text-midnight/60">
                        {technician.skills.length} self-reported skill(s) ·{' '}
                        {technician.coverage_areas.length} service area(s)
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <div className="grid min-w-0 content-start gap-5">
            {detailLoading ? (
              <div className="flex min-h-40 items-center gap-3 rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65">
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                  size={18}
                />{' '}
                Loading private technician details…
              </div>
            ) : selected ? (
              <>
                <DashboardCard
                  title="Private technician profile"
                  description="Visible only to an authorized admin via the protected review API."
                  icon={UserRound}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Display name
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-midnight">
                        {selected.display_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Account email
                      </p>
                      <p className="mt-1 break-all text-sm text-midnight/75">
                        {selected.email ?? 'Not supplied'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Onboarding
                      </p>
                      <p className="mt-1 text-sm text-midnight/75">{selected.onboarding_status}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Verification status
                      </p>
                      <p className="mt-1 text-sm font-semibold text-midnight">
                        {readableStatus(selected.verification_status)}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Professional description · self-reported
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-midnight/75">
                        {selected.professional_description || 'No description supplied.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Self-reported experience
                      </p>
                      <p className="mt-1 text-sm text-midnight/75">
                        {selected.years_experience === null
                          ? 'Not supplied'
                          : `${selected.years_experience} years · not independently verified`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/45">
                        Submitted
                      </p>
                      <p className="mt-1 text-sm text-midnight/75">
                        {selected.verification_submitted_at
                          ? new Date(selected.verification_submitted_at).toLocaleString()
                          : 'No submission timestamp'}
                      </p>
                    </div>
                  </div>
                </DashboardCard>

                <div className="grid gap-5 md:grid-cols-2">
                  <DashboardCard
                    title="Selected service skills"
                    description="Self-reported service selection; not proof of qualifications."
                    icon={ShieldCheck}
                  >
                    {selected.skills.length ? (
                      <ul className="grid gap-2">
                        {selected.skills.map((skill) => (
                          <li
                            key={skill.service_id}
                            className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-3"
                          >
                            <p className="text-sm font-semibold text-midnight">{skill.title}</p>
                            <p className="mt-1 text-xs text-midnight/55">
                              {skill.years_experience === null
                                ? 'Experience not supplied'
                                : `${skill.years_experience} self-reported year(s)`}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-midnight/55">No skills selected.</p>
                    )}
                  </DashboardCard>
                  <DashboardCard
                    title="Service coverage"
                    description="Account-private area preferences; not a promise of availability."
                    icon={UserRound}
                  >
                    {selected.coverage_areas.length ? (
                      <ul className="grid gap-2">
                        {selected.coverage_areas.map((area) => (
                          <li
                            key={area.id}
                            className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-3 text-sm text-midnight/75"
                          >
                            {area.area_name}, {area.city}, {area.state}
                            {area.postal_code ? ` · ${area.postal_code}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-midnight/55">No service areas supplied.</p>
                    )}
                  </DashboardCard>
                </div>

                <DashboardCard
                  title="Admin review decision"
                  description="Approve or reject only a pending request. The result records an admin decision; this frontend does not issue a public verification badge."
                  icon={ShieldCheck}
                >
                  {selected.verification_status === 'pending_review' ? (
                    <>
                      <label
                        htmlFor="review-note"
                        className="grid gap-1.5 text-sm font-semibold text-midnight"
                      >
                        Review note{' '}
                        <span className="text-xs font-normal leading-5 text-midnight/55">
                          A rejection requires a reason; keep notes factual and limited to the
                          review decision.
                        </span>
                        <textarea
                          id="review-note"
                          value={reviewNote}
                          onChange={(event) => setReviewNote(event.currentTarget.value)}
                          maxLength={2000}
                          rows={3}
                          className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm leading-6 font-normal outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                        />
                      </label>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decide('rejected')}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d99b93] px-4 text-sm font-semibold text-[#8d3028] disabled:opacity-50"
                        >
                          <XCircle aria-hidden="true" size={16} /> Reject
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decide('approved')}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 aria-hidden="true" size={16} /> Approve
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="flex items-start gap-2 text-sm leading-6 text-midnight/65">
                      <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={17} /> This
                      record is not pending review. No further decision can be recorded unless a
                      technician submits a new eligible request.
                    </p>
                  )}
                  {selected.reviews.length ? (
                    <div className="mt-5 border-t border-midnight/8 pt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/50">
                        Admin review history
                      </h3>
                      <ul className="mt-3 grid gap-2">
                        {selected.reviews.map((review) => (
                          <li key={review.id} className="rounded-xl border border-midnight/10 p-3">
                            <p className="text-sm font-semibold text-midnight">
                              {review.decision === 'approved' ? 'Approved' : 'Rejected'} ·{' '}
                              {new Date(review.created_at).toLocaleString()}
                            </p>
                            {review.note ? (
                              <p className="mt-1 text-xs leading-5 text-midnight/65">
                                {review.note}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </DashboardCard>
              </>
            ) : (
              <DashboardCard
                title="Select a technician"
                description="Choose a record from the queue to inspect its private profile and review history."
                icon={UserRound}
              >
                <p className="text-sm leading-6 text-midnight/60">
                  This screen does not fabricate technician records. If no records appear, there may
                  be no account with the selected status.
                </p>
              </DashboardCard>
            )}
          </div>
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-midnight/50">
        Technician approval is not assigned automatically. Only an authorized admin can make an
        explicit decision; technician-owned fields cannot set their own verification status.
      </p>
    </>
  );
}
