'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardCheck, LoaderCircle } from 'lucide-react';

import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { listClaims, respondToClaim } from '@/lib/api/homepassport';
import type { WarrantyClaim } from '@/lib/api/homepassport';
import { claimStatusLabels, claimStatusTone } from '@/lib/api/homepassport';
import {
  ClaimStatusPill,
  LoadingNotice,
  messageForPassportError,
  Notice,
  inputClass,
  labelClass,
} from './passport-ui';

function formatDateTime(value: string, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export function ClaimsPage() {
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [respondDrafts, setRespondDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const body = await listClaims();
      setClaims(body.items);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(event: FormEvent<HTMLFormElement>, claim: WarrantyClaim) {
    event.preventDefault();
    const note = (respondDrafts[claim.id] ?? '').trim();
    if (note.length < 2) {
      setError('Add a note of at least 2 characters for support to review.');
      return;
    }
    setBusyId(claim.id);
    setError(null);
    setSuccess(null);
    try {
      await respondToClaim(claim.id, note);
      setRespondDrafts((drafts) => ({ ...drafts, [claim.id]: '' }));
      setSuccess('Information sent to support. The claim is back under review.');
      await load();
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Warranty claims"
          title="Your warranty claims."
          description="Loading the claims linked to your FixNear account."
        />
        <LoadingNotice />
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        eyebrow="Warranty claims"
        title="Your warranty claims."
        description="Claims are filed against a recorded warranty. The issuing provider or FixNear support reviews evidence you provide — approval is never automatic."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      {claims.length === 0 && !error ? (
        <DashboardEmptyState
          icon={ClipboardCheck}
          title="No claims filed yet"
          description="Open a warranty record and use “File a claim” when something goes wrong. You can attach documents from the Documents vault."
        />
      ) : (
        <div className="grid gap-4">
          {claims.map((claim) => (
            <article key={claim.id} className="rounded-2xl border border-midnight/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ClaimStatusPill status={claim.status} />
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-medium ${claimStatusTone(claim.status)}`}
                  >
                    Submitted {formatDateTime(claim.submitted_at)}
                  </span>
                </div>
                <Link
                  href={`/dashboard/warranties/${claim.warranty_id}`}
                  className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-midnight underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight"
                >
                  {claim.warranty_provider}
                  {claim.appliance_name ? ` · ${claim.appliance_name}` : ''}
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-midnight/85">
                {claim.issue_description}
              </p>
              {claim.decision_reason ? (
                <p className="mt-3 rounded-xl border border-midnight/12 bg-[#f8faf7] p-3 text-sm leading-6 text-midnight/80">
                  <span className="font-semibold">Reason recorded by support:</span>{' '}
                  {claim.decision_reason}
                </p>
              ) : null}

              <ol className="mt-4 grid gap-2 border-t border-midnight/10 pt-4">
                {claim.history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-xs leading-5">
                    <span
                      className="mt-0.5 size-2 shrink-0 rounded-full bg-midnight/25"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-semibold text-midnight">
                        {entry.from_status
                          ? `${claimStatusLabels[entry.from_status]} → ${claimStatusLabels[entry.to_status]}`
                          : claimStatusLabels[entry.to_status]}
                      </span>
                      <span className="block text-midnight/55">
                        {entry.actor_role === 'admin' ? 'FixNear support' : 'You'} ·{' '}
                        {formatDateTime(entry.created_at)}
                        {entry.note ? ` · “${entry.note}”` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>

              {claim.status === 'additional_information_requested' ? (
                <form
                  onSubmit={(event) => void respond(event, claim)}
                  className="mt-4 rounded-xl border border-[#e9d9a6] bg-[#fffbe8] p-4"
                >
                  <label className={labelClass} htmlFor={`respond-${claim.id}`}>
                    Support asked for more information
                  </label>
                  <textarea
                    id={`respond-${claim.id}`}
                    required
                    minLength={2}
                    maxLength={4000}
                    className={`${inputClass} mt-2 min-h-20 py-2`}
                    placeholder="Answer the request, or describe where the document was uploaded."
                    value={respondDrafts[claim.id] ?? ''}
                    onChange={(event) =>
                      setRespondDrafts((drafts) => ({ ...drafts, [claim.id]: event.target.value }))
                    }
                  />
                  <button
                    type="submit"
                    disabled={busyId === claim.id}
                    className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
                  >
                    {busyId === claim.id ? (
                      <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                    ) : null}
                    Send response
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
