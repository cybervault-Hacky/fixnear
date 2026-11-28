'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldBan,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminErrorState, AdminLoadingState } from '@/features/admin/components/AdminShell';
import { adminErrorMessage, isForbidden } from '@/features/admin/components/admin-errors';
import { getCustomer, listCustomers, reactivateCustomer, suspendCustomer } from '@/lib/api/admin';
import type { AdminCustomerDetail, AdminCustomerList } from '@/lib/api/admin';

const PAGE_SIZE = 20;
type AccountStatus = 'pending' | 'active' | 'suspended' | 'disabled';
const STATUS_FILTERS: { value: '' | AccountStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending' },
  { value: 'disabled', label: 'Disabled' },
];

const statusStyles: Record<string, string> = {
  active: 'bg-[#eef7e5] text-midnight',
  suspended: 'bg-[#fff3f1] text-[#8d3028]',
  pending: 'bg-[#fff4d8] text-[#72510b]',
  disabled: 'bg-[#f1f3f5] text-midnight/60',
};

export function AdminCustomersPage() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<'' | AccountStatus>('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminCustomerList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [reason, setReason] = useState('');
  const [reasonAction, setReasonAction] = useState<'suspend' | 'reactivate' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listCustomers({
      search: appliedSearch || undefined,
      account_status: status || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((result) => setData(result))
      .catch((requestError: unknown) => {
        setForbidden(isForbidden(requestError));
        setError(adminErrorMessage(requestError, 'The customer directory could not be loaded.'));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [appliedSearch, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback((userId: string) => {
    setSelectedId(userId);
    setDetail(null);
    setDetailError('');
    setReason('');
    setReasonAction(null);
    setActionMessage('');
    setActionError('');
    setDetailLoading(true);
    getCustomer(userId)
      .then((result) => setDetail(result))
      .catch((requestError: unknown) => setDetailError(adminErrorMessage(requestError)))
      .finally(() => setDetailLoading(false));
  }, []);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setAppliedSearch(search.trim());
  };

  const submitReason = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !reasonAction) return;
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
      reasonAction === 'suspend'
        ? suspendCustomer(selectedId, trimmed)
        : reactivateCustomer(selectedId, trimmed);
    action
      .then(() => {
        setActionMessage(
          reasonAction === 'suspend'
            ? 'Account suspended. The reason is recorded in the audit log.'
            : 'Account reactivated. The change is recorded in the audit log.',
        );
        setReason('');
        setReasonAction(null);
        return getCustomer(selectedId);
      })
      .then((refreshed) => {
        setDetail(refreshed);
        load();
      })
      .catch((requestError: unknown) => setActionError(adminErrorMessage(requestError)))
      .finally(() => setActionBusy(false));
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin"
        title="Customer management"
        description="Search registered customers, inspect account standing and booking history, and suspend or reactivate accounts with a mandatory, audited reason. Emails and phone numbers are visible only to administrators."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <DashboardCard
          title="Customers"
          description="Real accounts from the identity projection. Suspended accounts immediately lose API access."
          icon={Users}
        >
          <form onSubmit={applySearch} className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 grow">
              <span className="sr-only">Search by email or display name</span>
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-midnight/40"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email or display name…"
                className="min-h-11 w-full rounded-xl border border-midnight/15 bg-white pl-9 pr-3 text-sm text-midnight placeholder:text-midnight/40 focus-visible:outline-2 focus-visible:outline-midnight"
              />
            </label>
            <label>
              <span className="sr-only">Filter by account status</span>
              <select
                value={status}
                onChange={(event) => {
                  setPage(0);
                  setStatus(event.target.value as '' | AccountStatus);
                }}
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight focus-visible:outline-2 focus-visible:outline-midnight"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-xl bg-midnight px-4 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-midnight"
            >
              Search
            </button>
            <button
              type="button"
              onClick={load}
              aria-label="Refresh customers"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-midnight/15 bg-white text-midnight hover:bg-[#f4f6f8]"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </form>

          {loading ? <AdminLoadingState label="Loading customers…" /> : null}
          {error && forbidden ? <AdminErrorState message={error} /> : null}
          {error && !forbidden ? <AdminErrorState message={error} onRetry={load} /> : null}

          {data && !loading ? (
            data.items.length === 0 ? (
              <p className="mt-4 text-sm text-midnight/55">
                No customers match the current filters.
              </p>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-midnight/8 overflow-hidden rounded-2xl border border-midnight/10">
                  {data.items.map((customer) => (
                    <li key={customer.user_id}>
                      <button
                        type="button"
                        onClick={() => openDetail(customer.user_id)}
                        aria-current={selectedId === customer.user_id}
                        className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-[#f4f6f8] ${
                          selectedId === customer.user_id ? 'bg-[#eef2ec]' : 'bg-white'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-midnight">
                            {customer.display_name ?? 'Unnamed customer'}
                          </span>
                          <span className="block truncate text-xs text-midnight/55">
                            {customer.email ?? 'No email on file'}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[0.7rem] tabular-nums text-midnight/50">
                            {customer.bookings_total} bookings
                          </span>
                          <span
                            className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[0.65rem] font-semibold uppercase tracking-wide ${statusStyles[customer.account_status] ?? ''}`}
                          >
                            {customer.account_status}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between text-xs text-midnight/60">
                  <span className="tabular-nums">
                    {data.total} customer{data.total === 1 ? '' : 's'} · page {page + 1} of{' '}
                    {totalPages}
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
              </>
            )
          ) : null}
        </DashboardCard>

        <DashboardCard
          title="Customer detail"
          description="Booking history, HomePassport footprint and support record."
          icon={ShieldCheck}
        >
          {!selectedId ? (
            <p className="text-sm text-midnight/55">Select a customer to inspect their account.</p>
          ) : null}
          {selectedId && detailLoading ? <AdminLoadingState label="Loading customer…" /> : null}
          {detailError ? <AdminErrorState message={detailError} /> : null}
          {detail ? (
            <div className="grid gap-4">
              <div>
                <p className="text-base font-semibold text-midnight">
                  {detail.display_name ?? 'Unnamed customer'}
                </p>
                <p className="text-xs text-midnight/55">
                  {detail.email ?? 'No email'}
                  {detail.phone_e164 ? ` · ${detail.phone_e164}` : ''}
                </p>
                <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-midnight/45">
                  {detail.account_status} · joined{' '}
                  {new Date(detail.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  · {detail.role_codes.join(', ')}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  { value: detail.bookings_total, label: 'bookings' },
                  { value: detail.bookings_completed, label: 'completed' },
                  { value: detail.bookings_cancelled, label: 'cancelled' },
                  { value: detail.reviews_submitted, label: 'reviews' },
                  { value: detail.appliance_count, label: 'appliances' },
                  { value: detail.warranty_count, label: 'warranties' },
                  { value: detail.open_warranty_claims, label: 'open claims' },
                  { value: detail.open_tickets, label: 'open tickets' },
                ].map((cell, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-2"
                  >
                    <dt className="sr-only">{cell.label}</dt>
                    <dd className="text-base font-semibold text-midnight">{cell.value}</dd>
                    <dd className="text-[0.65rem] uppercase tracking-wide text-midnight/50">
                      {cell.label}
                    </dd>
                  </div>
                ))}
              </dl>

              {detail.recent_bookings.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                    Recent bookings
                  </h3>
                  <ul className="mt-1 divide-y divide-midnight/8 rounded-xl border border-midnight/10">
                    {detail.recent_bookings.slice(0, 5).map((booking) => (
                      <li
                        key={booking.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-midnight/80">
                          {booking.service_slug} · {booking.preferred_date}
                        </span>
                        <span className="shrink-0 font-semibold text-midnight/60">
                          {booking.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detail.recent_tickets.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                    Support tickets
                  </h3>
                  <ul className="mt-1 divide-y divide-midnight/8 rounded-xl border border-midnight/10">
                    {detail.recent_tickets.map((ticket) => (
                      <li
                        key={ticket.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-midnight/80">{ticket.subject}</span>
                        <span className="shrink-0 font-semibold text-midnight/60">
                          {ticket.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {actionMessage ? (
                <p
                  role="status"
                  className="rounded-xl border border-[#cbe7ae] bg-[#eef7e5] px-3 py-2 text-xs font-semibold text-midnight"
                >
                  {actionMessage}
                </p>
              ) : null}
              {actionError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-3 py-2 text-xs font-semibold text-[#8d3028]"
                >
                  {actionError}
                </p>
              ) : null}

              {reasonAction ? (
                <form
                  onSubmit={submitReason}
                  className="rounded-xl border border-midnight/12 bg-[#fbfcf9] p-3"
                >
                  <label htmlFor="reason" className="text-xs font-semibold text-midnight">
                    Reason for {reasonAction === 'suspend' ? 'suspension' : 'reactivation'}{' '}
                    (required, min 10 characters)
                  </label>
                  <textarea
                    id="reason"
                    required
                    minLength={10}
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-midnight/15 bg-white p-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
                    placeholder="Describe the policy or incident this decision is based on…"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-midnight px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {actionBusy ? (
                        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                      ) : null}
                      Confirm {reasonAction === 'suspend' ? 'suspension' : 'reactivation'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReasonAction(null);
                        setActionError('');
                      }}
                      className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 px-4 text-xs font-semibold text-midnight"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.account_status !== 'suspended' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReasonAction('suspend');
                        setActionMessage('');
                        setActionError('');
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d99b93] px-4 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1]"
                    >
                      <ShieldBan size={14} aria-hidden="true" /> Suspend account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setReasonAction('reactivate');
                        setActionMessage('');
                        setActionError('');
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-midnight/15 bg-white px-4 text-xs font-semibold text-midnight hover:bg-[#f4f6f8]"
                    >
                      <ShieldCheck size={14} aria-hidden="true" /> Reactivate account
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-midnight/55 hover:text-midnight"
                  >
                    <X size={14} aria-hidden="true" /> Close
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </DashboardCard>
      </div>
    </>
  );
}
