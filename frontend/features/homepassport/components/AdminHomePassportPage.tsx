'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  History,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminShell } from '@/features/admin/components/AdminShell';
import {
  listAdminAuditEvents,
  listAdminClaimDocuments,
  listAdminClaims,
  listAdminWarranties,
  setWarrantyVerification,
  transitionClaim,
} from '@/lib/api/homepassport';
import type {
  AdminAuditEvent,
  AdminWarrantySummary,
  ApplianceDocument,
  ClaimStatus,
  VerificationStatus,
  WarrantyClaim,
} from '@/lib/api/homepassport';
import { claimStatusLabels, claimStatusTone, warrantyTypeLabels } from '@/lib/api/homepassport';
import {
  LoadingNotice,
  Notice,
  messageForPassportError,
  inputClass,
  labelClass,
  selectClass,
} from './passport-ui';

const PAGE_SIZE = 25;
const claimStatuses: ClaimStatus[] = [
  'submitted',
  'additional_information_requested',
  'under_review',
  'approved',
  'rejected',
  'closed',
];
const documentTypeLabels: Record<ApplianceDocument['document_type'], string> = {
  purchase_invoice: 'Purchase invoice',
  warranty_certificate: 'Warranty certificate',
  repair_report: 'Repair report',
  service_invoice: 'Service invoice',
  parts_receipt: 'Parts receipt',
  photo: 'Photo',
  other: 'Other document',
};

type Tab = 'claims' | 'warranties' | 'audit';

function formatDateTime(value: string, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export function AdminHomePassportPage() {
  const [tab, setTab] = useState<Tab>('claims');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <AdminShell>
      <DashboardPageHeader
        eyebrow="Admin · HomePassport"
        title="Warranty claims and records oversight."
        description="Review claims with recorded evidence, request information, decide with an audited reason and oversee warranty verification. Customers can never approve their own claims."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      <div role="tablist" aria-label="HomePassport admin sections" className="flex flex-wrap gap-2">
        {(
          [
            ['claims', 'Claim review', ClipboardCheck],
            ['warranties', 'Warranty verification', ShieldCheck],
            ['audit', 'Audit history', History],
          ] as [Tab, string, typeof ClipboardCheck][]
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setError(null);
              setSuccess(null);
            }}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${
              tab === value
                ? 'border-midnight bg-midnight text-white'
                : 'border-midnight/15 bg-white text-midnight hover:bg-[#f4f6f8]'
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === 'claims' ? (
          <ClaimsPanel setError={setError} setSuccess={setSuccess} />
        ) : tab === 'warranties' ? (
          <WarrantiesPanel setError={setError} setSuccess={setSuccess} />
        ) : (
          <AuditPanel setError={setError} />
        )}
      </div>
    </AdminShell>
  );
}

type PanelProps = {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
};

function ClaimsPanel({ setError, setSuccess }: PanelProps) {
  const [status, setStatus] = useState<'' | ClaimStatus>('submitted');
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WarrantyClaim | null>(null);
  const [evidence, setEvidence] = useState<ApplianceDocument[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (nextStatus: '' | ClaimStatus, nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const body = await listAdminClaims(nextStatus || undefined, PAGE_SIZE, nextOffset);
        setClaims(body.items);
        setTotal(body.total);
        setSelected((current) =>
          current ? (body.items.find((item) => item.id === current.id) ?? null) : null,
        );
      } catch (caught) {
        setError(messageForPassportError(caught));
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    setOffset(0);
    void load(status, 0);
    setSelected(null);
    setEvidence([]);
  }, [status, load]);

  useEffect(() => {
    if (!selected) {
      setEvidence([]);
      return;
    }
    let active = true;
    listAdminClaimDocuments(selected.id)
      .then((body) => {
        if (active) setEvidence(body.items);
      })
      .catch(() => {
        if (active) setEvidence([]);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  async function act(selectedClaim: WarrantyClaim, action: Parameters<typeof transitionClaim>[1]) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await transitionClaim(selectedClaim.id, action, note.trim() || undefined);
      setNote('');
      setSuccess(
        `Claim ${action.replace(/_/g, ' ')} recorded. The history below reflects the change.`,
      );
      setSelected(updated);
      await load(status, offset);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setBusy(false);
    }
  }

  const needsNote = (action: Parameters<typeof transitionClaim>[1]) =>
    action === 'request_information' || action === 'approve' || action === 'reject';

  if (loading && claims.length === 0) {
    return <LoadingNotice label="Loading claims…" />;
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <DashboardCard
        title="Claims queue"
        description="Newest first. Filter by the state the claim is currently in."
        icon={ClipboardCheck}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid min-w-56 gap-1">
            <label className="text-xs font-semibold text-midnight/60" htmlFor="claim-status">
              Filter by status
            </label>
            <select
              id="claim-status"
              className={selectClass}
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | ClaimStatus)}
            >
              <option value="">All statuses</option>
              {claimStatuses.map((value) => (
                <option key={value} value={value}>
                  {claimStatusLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void load(status, offset)}
            aria-label="Refresh claims"
            className="mt-5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-midnight/15 text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>

        <ul className="mt-4 grid gap-2">
          {claims.length === 0 ? (
            <li className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-4 text-sm text-midnight/60">
              No claims match this filter.
            </li>
          ) : (
            claims.map((claim) => (
              <li key={claim.id}>
                <button
                  type="button"
                  onClick={() => setSelected(claim)}
                  aria-pressed={selected?.id === claim.id}
                  className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-midnight ${
                    selected?.id === claim.id
                      ? 'border-midnight bg-white shadow-sm'
                      : 'border-midnight/10 bg-white hover:bg-[#f8faf7]'
                  }`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                      {formatDateTime(claim.submitted_at)}
                    </span>
                    <span
                      className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold ${claimStatusTone(claim.status)}`}
                    >
                      {claimStatusLabels[claim.status]}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-midnight">
                    {claim.warranty_provider} · {claim.warranty_type}
                    {claim.appliance_name ? ` · ${claim.appliance_name}` : ''}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-midnight/60">
                    {claim.issue_description.length > 160
                      ? `${claim.issue_description.slice(0, 160)}…`
                      : claim.issue_description}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        {total > PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-between text-xs text-midnight/60">
            <span>
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => {
                  const next = Math.max(0, offset - PAGE_SIZE);
                  setOffset(next);
                  void load(status, next);
                }}
                className="inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 font-semibold text-midnight disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => {
                  const next = offset + PAGE_SIZE;
                  setOffset(next);
                  void load(status, next);
                }}
                className="inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 font-semibold text-midnight disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </DashboardCard>

      <DashboardCard
        title="Claim review"
        description="Every decision is recorded in the claim history with your note."
        icon={Search}
      >
        {!selected ? (
          <p className="text-sm leading-6 text-midnight/60">
            Select a claim from the queue to review it.
          </p>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
              Filed {formatDateTime(selected.submitted_at)} · {claimStatusLabels[selected.status]}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-midnight/85">
              {selected.issue_description}
            </p>
            {selected.decision_reason ? (
              <p className="mt-3 rounded-xl border border-midnight/12 bg-[#f8faf7] p-3 text-sm leading-6 text-midnight/80">
                <span className="font-semibold">Decision reason:</span> {selected.decision_reason}
              </p>
            ) : null}

            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                Evidence ({evidence.length})
              </h3>
              {evidence.length === 0 ? (
                <p className="mt-1 text-xs text-midnight/55">
                  No documents attached to this claim. If you expected files, storage is either not
                  configured or the customer has not attached any.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs leading-5 text-midnight/50">
                    File contents are not retrievable yet: no download endpoint exists until the
                    storage integration is configured. Filenames, types and upload status are all
                    that can be reviewed here.
                  </p>
                  <ul className="mt-2 grid gap-2">
                    {evidence.map((document) => (
                      <li
                        key={document.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-midnight/12 bg-white p-3 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium text-midnight">
                          {document.original_filename}
                        </span>
                        <span className="text-xs text-midnight/55">
                          {documentTypeLabels[document.document_type]} ·{' '}
                          {document.status === 'uploaded' ? 'Uploaded' : document.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <ol className="mt-4 grid gap-2 border-t border-midnight/10 pt-4">
              {selected.history.map((entry) => (
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
                      {entry.actor_role === 'admin' ? 'Support' : 'Customer'} ·{' '}
                      {formatDateTime(entry.created_at)}
                      {entry.note ? ` · “${entry.note}”` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-4">
              <label className={labelClass} htmlFor="transition-note">
                Note{' '}
                <span className="font-normal text-midnight/45">
                  (required for request information, approve and reject)
                </span>
              </label>
              <textarea
                id="transition-note"
                maxLength={1000}
                className={`${inputClass} mt-1 min-h-16 py-2`}
                placeholder="Recorded verbatim in the claim history."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ['start_review', 'Start review'],
                    ['request_information', 'Request information'],
                    ['approve', 'Approve'],
                    ['reject', 'Reject'],
                    ['close', 'Close'],
                  ] as [Parameters<typeof transitionClaim>[1], string][]
                ).map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy || (needsNote(action) && note.trim().length < 3)}
                    onClick={() => void act(selected, action)}
                    title={
                      needsNote(action) && note.trim().length < 3
                        ? 'Enter a note of at least 3 characters first'
                        : undefined
                    }
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-40 ${
                      action === 'approve'
                        ? 'border-[#cbe7ae] bg-[#eef7e5] text-midnight hover:bg-[#e2f2d2]'
                        : action === 'reject'
                          ? 'border-[#e9b8b2] bg-[#fff3f1] text-[#8d3028] hover:bg-[#ffe9e6]'
                          : 'border-midnight/15 bg-white text-midnight hover:bg-[#f4f6f8]'
                    }`}
                  >
                    {busy ? (
                      <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                    ) : null}
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-midnight/50">
                Transitions are enforced server-side. Approving a claim records the decision only —
                payment and fulfilment remain with the provider.
              </p>
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

function WarrantiesPanel({ setError, setSuccess }: PanelProps) {
  const [filter, setFilter] = useState<'' | VerificationStatus>('unverified');
  const [items, setItems] = useState<AdminWarrantySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(
    async (nextFilter: '' | VerificationStatus, nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const body = await listAdminWarranties(nextFilter || undefined, PAGE_SIZE, nextOffset);
        setItems(body.items);
        setTotal(body.total);
      } catch (caught) {
        setError(messageForPassportError(caught));
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    setOffset(0);
    void load(filter, 0);
  }, [filter, load]);

  async function verify(item: AdminWarrantySummary, verificationStatus: VerificationStatus) {
    const note = (notes[item.id] ?? '').trim();
    if (note.length < 3) {
      setError('Add a note of at least 3 characters describing how the record was checked.');
      return;
    }
    setBusyId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await setWarrantyVerification(item.id, verificationStatus, note);
      setNotes((current) => ({ ...current, [item.id]: '' }));
      setSuccess(
        verificationStatus === 'verified'
          ? 'Warranty marked verified. The change is audited.'
          : 'Warranty verification status updated. The change is audited.',
      );
      await load(filter, offset);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (loading && items.length === 0) {
    return <LoadingNotice label="Loading warranty records…" />;
  }

  return (
    <DashboardCard
      title="Warranty verification queue"
      description="Verification records that support checked the provider’s details. It never asserts coverage."
      icon={ShieldCheck}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 gap-1">
          <label className="text-xs font-semibold text-midnight/60" htmlFor="verification-filter">
            Filter by verification status
          </label>
          <select
            id="verification-filter"
            className={selectClass}
            value={filter}
            onChange={(event) => setFilter(event.target.value as '' | VerificationStatus)}
          >
            <option value="">All statuses</option>
            <option value="unverified">Unverified</option>
            <option value="pending_review">Pending review</option>
            <option value="verified">Verified</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load(filter, offset)}
          aria-label="Refresh warranties"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-midnight/15 text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>

      <ul className="mt-4 grid gap-3">
        {items.length === 0 ? (
          <li className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-4 text-sm text-midnight/60">
            No warranty records match this filter.
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="rounded-xl border border-midnight/12 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-midnight">
                    {item.provider}{' '}
                    <span className="font-normal text-midnight/55">
                      · {warrantyTypeLabels[item.warranty_type]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-midnight/60">
                    {item.customer_display_name ?? 'Customer'} ·{' '}
                    {item.appliance_name ?? item.part_name ?? 'Linked record'} · {item.start_date} →{' '}
                    {item.end_date}
                  </p>
                </div>
                <span className="inline-flex min-h-7 items-center rounded-full bg-[#f1f3f5] px-3 py-1 text-xs font-semibold text-midnight/65">
                  {item.verification_status.replace(/_/g, ' ')}
                </span>
              </div>
              <label
                className="mt-3 block text-xs font-semibold text-midnight/60"
                htmlFor={`verify-note-${item.id}`}
              >
                Verification note (required)
              </label>
              <input
                id={`verify-note-${item.id}`}
                className={`${inputClass} mt-1`}
                maxLength={1000}
                placeholder="e.g. Provider portal reference confirmed."
                value={notes[item.id] ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                }
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void verify(item, 'verified')}
                  className="inline-flex min-h-10 items-center rounded-xl border border-[#cbe7ae] bg-[#eef7e5] px-4 text-xs font-semibold text-midnight hover:bg-[#e2f2d2] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                >
                  Mark verified
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void verify(item, 'pending_review')}
                  className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 bg-white px-4 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                >
                  Pending review
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void verify(item, 'unverified')}
                  className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 bg-white px-4 text-xs font-semibold text-midnight/70 hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                >
                  Reset to unverified
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      {total > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between text-xs text-midnight/60">
          <span>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => {
                const next = Math.max(0, offset - PAGE_SIZE);
                setOffset(next);
                void load(filter, next);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 font-semibold text-midnight disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                void load(filter, next);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 font-semibold text-midnight disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </DashboardCard>
  );
}

function AuditPanel({ setError }: { setError: (value: string | null) => void }) {
  const [entityType, setEntityType] = useState('');
  const [items, setItems] = useState<AdminAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextEntityType: string, nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const body = await listAdminAuditEvents(nextEntityType || undefined, PAGE_SIZE, nextOffset);
        setItems(body.items);
        setTotal(body.total);
      } catch (caught) {
        setError(messageForPassportError(caught));
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    setOffset(0);
    void load(entityType, 0);
  }, [entityType, load]);

  if (loading && items.length === 0) {
    return <LoadingNotice label="Loading audit history…" />;
  }

  return (
    <DashboardCard
      title="Audit history"
      description="Recorded changes to HomePassport data made by support. Newest first. Service-history text corrections are performed through the admin API and appear here; there is no admin list view for them yet."
      icon={History}
    >
      <div className="grid max-w-xs gap-1">
        <label className="text-xs font-semibold text-midnight/60" htmlFor="audit-entity">
          Filter by entity
        </label>
        <select
          id="audit-entity"
          className={selectClass}
          value={entityType}
          onChange={(event) => setEntityType(event.target.value)}
        >
          <option value="">All entities</option>
          <option value="appliance">Appliance</option>
          <option value="warranty">Warranty</option>
          <option value="warranty_claim">Claim</option>
          <option value="service_history">Service history</option>
          <option value="document">Document</option>
        </select>
      </div>

      <ul className="mt-4 grid gap-2">
        {items.length === 0 ? (
          <li className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-4 text-sm text-midnight/60">
            No audit events recorded yet.
          </li>
        ) : (
          items.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-3 text-sm leading-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-midnight">
                  {event.action}{' '}
                  <span className="font-normal text-midnight/55">· {event.entity_type}</span>
                </span>
                <span className="text-xs text-midnight/50">{formatDateTime(event.created_at)}</span>
              </div>
              {event.changed_fields.length > 0 ? (
                <p className="mt-0.5 text-xs text-midnight/60">
                  Changed: {event.changed_fields.join(', ')}
                </p>
              ) : null}
              {event.note ? (
                <p className="mt-0.5 text-xs text-midnight/60">“{event.note}”</p>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {total > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between text-xs text-midnight/60">
          <span>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => {
                const next = Math.max(0, offset - PAGE_SIZE);
                setOffset(next);
                void load(entityType, next);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 font-semibold text-midnight disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                void load(entityType, next);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 font-semibold text-midnight disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </DashboardCard>
  );
}
