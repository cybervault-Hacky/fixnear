'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { fileClaim, getWarranty, updateWarranty } from '@/lib/api/homepassport';
import type { Warranty } from '@/lib/api/homepassport';
import { warrantyTypeLabels, claimStatusLabels } from '@/lib/api/homepassport';
import {
  LoadingNotice,
  messageForPassportError,
  Notice,
  VerificationPill,
  WarrantyStatusPill,
  inputClass,
  labelClass,
} from './passport-ui';

export function WarrantyDetailPage({ warrantyId }: { warrantyId: string }) {
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    provider: '',
    reference_number: '',
    start_date: '',
    end_date: '',
    terms_summary: '',
  });
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState('');
  const [claimSaving, setClaimSaving] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const body = await getWarranty(warrantyId);
      setWarranty(body);
      setEditForm({
        provider: body.provider,
        reference_number: body.reference_number ?? '',
        start_date: body.start_date,
        end_date: body.end_date,
        terms_summary: body.terms_summary ?? '',
      });
    } catch (caught) {
      setError(messageForPassportError(caught));
      setWarranty(null);
    } finally {
      setLoading(false);
    }
  }, [warrantyId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateWarranty(warrantyId, {
        provider: editForm.provider.trim(),
        reference_number: editForm.reference_number.trim() || null,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        terms_summary: editForm.terms_summary.trim() || null,
      });
      setEditing(false);
      setSuccess('Warranty record updated. Admin-visible changes are audited.');
      await load();
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClaimError(null);
    setSuccess(null);
    if (issue.trim().length < 10) {
      setClaimError('Describe the issue in at least 10 characters.');
      return;
    }
    setClaimSaving(true);
    try {
      await fileClaim(warrantyId, issue.trim());
      setIssue('');
      setSuccess(
        'Claim submitted. The issuing provider decides the outcome; track progress in Claims.',
      );
      await load();
    } catch (caught) {
      setClaimError(messageForPassportError(caught));
    } finally {
      setClaimSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Warranty vault · record"
          title="Loading warranty…"
          description="Fetching the recorded terms for this warranty."
        />
        <LoadingNotice />
      </>
    );
  }

  if (!warranty) {
    return (
      <>
        <Link
          href="/dashboard/warranties"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-midnight underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to warranties
        </Link>
        <div className="mt-4">
          <Notice kind="error">{error ?? 'Warranty not found.'}</Notice>
        </div>
      </>
    );
  }

  return (
    <>
      <Link
        href="/dashboard/warranties"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-midnight underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to warranties
      </Link>

      <DashboardPageHeader
        eyebrow="Warranty vault · record"
        title={warranty.provider}
        description="Recorded terms and dates for this warranty. Coverage is decided by the issuing provider, never by this page."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      <DashboardCard
        title="Recorded warranty"
        description="What the document or provider told you. FixNear does not change these terms."
        icon={ShieldCheck}
      >
        {editing ? (
          <form onSubmit={saveEdit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <label className={labelClass} htmlFor="edit-provider">
                  Provider / company *
                </label>
                <input
                  id="edit-provider"
                  required
                  minLength={2}
                  maxLength={160}
                  className={inputClass}
                  value={editForm.provider}
                  onChange={(event) => setEditForm({ ...editForm, provider: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="edit-reference">
                  Reference number
                </label>
                <input
                  id="edit-reference"
                  maxLength={120}
                  className={inputClass}
                  value={editForm.reference_number}
                  onChange={(event) =>
                    setEditForm({ ...editForm, reference_number: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="edit-terms-hint">
                  Linked to
                </label>
                <p
                  id="edit-terms-hint"
                  className="flex min-h-11 items-center text-sm text-midnight/70"
                >
                  {warranty.appliance_name ?? warranty.part_name ?? 'Linked record'}
                </p>
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="edit-start">
                  Start date *
                </label>
                <input
                  id="edit-start"
                  type="date"
                  required
                  className={inputClass}
                  value={editForm.start_date}
                  onChange={(event) => setEditForm({ ...editForm, start_date: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="edit-end">
                  End date *
                </label>
                <input
                  id="edit-end"
                  type="date"
                  required
                  className={inputClass}
                  value={editForm.end_date}
                  onChange={(event) => setEditForm({ ...editForm, end_date: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <label className={labelClass} htmlFor="edit-terms">
                  Terms summary
                </label>
                <textarea
                  id="edit-terms"
                  maxLength={4000}
                  className={`${inputClass} min-h-28 py-3`}
                  value={editForm.terms_summary}
                  onChange={(event) =>
                    setEditForm({ ...editForm, terms_summary: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                ) : null}
                Save changes
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="inline-flex min-h-11 items-center rounded-xl border border-midnight/15 px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <WarrantyStatusPill status={warranty.status} />
              <VerificationPill status={warranty.verification_status} />
              <span className="inline-flex min-h-7 items-center rounded-full bg-[#f1f3f5] px-3 py-1 text-xs font-semibold text-midnight/65">
                {warrantyTypeLabels[warranty.warranty_type]}
              </span>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm text-midnight/80 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                  Coverage period
                </dt>
                <dd>
                  {warranty.start_date} → {warranty.end_date}
                  <span className="block text-xs text-midnight/55">
                    {warranty.days_remaining >= 0
                      ? `${warranty.days_remaining} day(s) remain`
                      : `Ended ${-warranty.days_remaining} day(s) ago`}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                  Reference number
                </dt>
                <dd>{warranty.reference_number ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                  Linked to
                </dt>
                <dd>
                  {warranty.appliance_name ? (
                    <Link
                      href={`/dashboard/homepassport/${warranty.appliance_id}`}
                      className="underline underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      {warranty.appliance_name}
                    </Link>
                  ) : (
                    (warranty.part_name ?? 'Linked record')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                  Latest claim
                </dt>
                <dd>
                  {warranty.latest_claim_status
                    ? claimStatusLabels[warranty.latest_claim_status]
                    : 'No claims filed'}
                </dd>
              </div>
            </dl>
            {warranty.terms_summary ? (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                  Recorded terms
                </h3>
                <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-midnight/80">
                  {warranty.terms_summary}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-xs text-midnight/55">
                No terms summary recorded. Add the inclusions, exclusions and claim steps from the
                document itself.
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-midnight/15 bg-white px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              Edit recorded details
            </button>
          </>
        )}
      </DashboardCard>

      <DashboardCard
        className="mt-5"
        title="File a claim"
        description="Filing a claim asks the provider or FixNear support to review the issue. It never guarantees approval."
        icon={ShieldCheck}
      >
        {warranty.open_claim_id ? (
          <div>
            <p className="text-sm leading-6 text-midnight/75">
              A claim is already open for this warranty
              {warranty.latest_claim_status
                ? ` (${claimStatusLabels[warranty.latest_claim_status]})`
                : ''}
              . Wait for the decision before filing another.
            </p>
            <Link
              href="/dashboard/claims"
              className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-midnight/15 px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
            >
              Go to claims
            </Link>
          </div>
        ) : !warranty.claim_eligible ? (
          <p className="text-sm leading-6 text-midnight/75">
            This warranty’s recorded start date is in the future, so a claim cannot be filed yet.
          </p>
        ) : (
          <form onSubmit={submitClaim} className="grid gap-3">
            {claimError ? <Notice kind="error">{claimError}</Notice> : null}
            <label className={labelClass} htmlFor="claim-issue">
              What is going wrong? *
            </label>
            <textarea
              id="claim-issue"
              required
              minLength={10}
              maxLength={4000}
              className={`${inputClass} min-h-28 py-3`}
              placeholder="Describe the fault, when it started, and what you have already tried (at least 10 characters)."
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
            />
            <p className="text-xs leading-5 text-midnight/55">
              Attach documents or photos from{' '}
              <Link
                href="/dashboard/documents"
                className="underline underline-offset-4 hover:text-midnight"
              >
                Documents
              </Link>{' '}
              so support can review evidence. If upload is unavailable, say so in the description.
            </p>
            <button
              type="submit"
              disabled={claimSaving}
              className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
            >
              {claimSaving ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : null}
              Submit claim
            </button>
          </form>
        )}
      </DashboardCard>
    </>
  );
}
