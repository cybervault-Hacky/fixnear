'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, RefreshCw, Search } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminBookingFrame } from '@/features/bookings/components/AdminBookingFrame';
import {
  BookingStatusPill,
  formatBookingDate,
  formatPaise,
  formatWindow,
  LoadingNotice,
  messageForBookingError,
  Notice,
} from '@/features/bookings/components/booking-ui';
import { listAdminBookings } from '@/lib/api/bookings';
import type {
  AdminBookingFilters,
  BookingEscalationStatus,
  BookingList,
  BookingStatus,
} from '@/lib/api/bookings';

const PAGE_SIZE = 25;
const bookingStatuses: BookingStatus[] = [
  'requested',
  'assigned',
  'accepted',
  'inspection_pending',
  'quote_pending',
  'quote_rejected',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
];
type FilterDraft = {
  status: '' | BookingStatus;
  escalation_status: '' | BookingEscalationStatus;
  service_slug: string;
  technician_user_id: string;
  date_from: string;
  date_to: string;
};
const emptyFilters: FilterDraft = {
  status: '',
  escalation_status: '',
  service_slug: '',
  technician_user_id: '',
  date_from: '',
  date_to: '',
};

export function AdminBookingListPage() {
  const [draft, setDraft] = useState<FilterDraft>(emptyFilters);
  const [filters, setFilters] = useState<AdminBookingFilters>({});
  const [bookings, setBookings] = useState<BookingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void listAdminBookings({ ...filters, limit: PAGE_SIZE, offset: 0 })
      .then((result) => {
        if (active) setBookings(result);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setBookings(null);
        setError(messageForBookingError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, refreshVersion]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilterError('');
    if (draft.date_from && draft.date_to && draft.date_to < draft.date_from) {
      setFilterError('The end of the preferred-date range cannot be earlier than its start.');
      return;
    }
    const nextFilters: AdminBookingFilters = {
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.escalation_status ? { escalation_status: draft.escalation_status } : {}),
      ...(draft.service_slug.trim() ? { service_slug: draft.service_slug.trim() } : {}),
      ...(draft.technician_user_id.trim()
        ? { technician_user_id: draft.technician_user_id.trim() }
        : {}),
      ...(draft.date_from ? { date_from: draft.date_from } : {}),
      ...(draft.date_to ? { date_to: draft.date_to } : {}),
    };
    setFilters(nextFilters);
  };

  const clearFilters = () => {
    setDraft(emptyFilters);
    setFilters({});
    setFilterError('');
  };

  const loadMore = async () => {
    if (!bookings || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const next = await listAdminBookings({
        ...filters,
        limit: PAGE_SIZE,
        offset: bookings.items.length,
      });
      setBookings((current) =>
        current ? { ...next, items: [...current.items, ...next.items] } : next,
      );
    } catch (requestError) {
      setError(messageForBookingError(requestError));
    } finally {
      setLoadingMore(false);
    }
  };

  const updateDraft = <K extends keyof FilterDraft>(field: K, value: FilterDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <AdminBookingFrame>
      <DashboardPageHeader
        eyebrow="Admin · private booking operations"
        title="Booking oversight."
        description="Filter requests, inspect PriceLock versions, manage eligible assignments, handle cancellation or escalation, and review the ordered audit history. The API enforces admin authorization for every record."
        action={
          <Link
            href="/admin/service-catalog"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
          >
            Service catalog <ArrowRight aria-hidden="true" size={15} />
          </Link>
        }
      />

      <div className="grid gap-5">
        <DashboardCard
          title="Filter bookings"
          description="Preferred-date filters refer to customer-requested dates, not confirmed appointments."
          icon={Search}
        >
          <form onSubmit={applyFilters} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="grid gap-2">
              <label htmlFor="admin-booking-status" className="text-sm font-semibold text-midnight">
                Status
              </label>
              <select
                id="admin-booking-status"
                value={draft.status}
                onChange={(event) =>
                  updateDraft('status', event.currentTarget.value as FilterDraft['status'])
                }
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              >
                <option value="">All statuses</option>
                {bookingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="admin-escalation-status"
                className="text-sm font-semibold text-midnight"
              >
                Escalation status
              </label>
              <select
                id="admin-escalation-status"
                value={draft.escalation_status}
                onChange={(event) =>
                  updateDraft(
                    'escalation_status',
                    event.currentTarget.value as FilterDraft['escalation_status'],
                  )
                }
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              >
                <option value="">Any escalation state</option>
                <option value="normal">Normal</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="admin-service-slug" className="text-sm font-semibold text-midnight">
                Service slug
              </label>
              <input
                id="admin-service-slug"
                value={draft.service_slug}
                onChange={(event) => updateDraft('service_slug', event.currentTarget.value)}
                maxLength={80}
                placeholder="Optional exact service slug"
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none placeholder:text-midnight/35 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="admin-technician-id" className="text-sm font-semibold text-midnight">
                Assigned technician user ID
              </label>
              <input
                id="admin-technician-id"
                value={draft.technician_user_id}
                onChange={(event) => updateDraft('technician_user_id', event.currentTarget.value)}
                placeholder="Optional UUID"
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none placeholder:text-midnight/35 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="admin-date-from" className="text-sm font-semibold text-midnight">
                Preferred date from
              </label>
              <input
                id="admin-date-from"
                type="date"
                value={draft.date_from}
                onChange={(event) => updateDraft('date_from', event.currentTarget.value)}
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="admin-date-to" className="text-sm font-semibold text-midnight">
                Preferred date to
              </label>
              <input
                id="admin-date-to"
                type="date"
                value={draft.date_to}
                onChange={(event) => updateDraft('date_to', event.currentTarget.value)}
                className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              />
            </div>
            {filterError ? (
              <p
                role="alert"
                className="rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028] sm:col-span-2 xl:col-span-3"
              >
                {filterError}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end xl:col-span-3">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
              >
                Clear filters
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white hover:bg-[#1d2a3f]"
              >
                <Search aria-hidden="true" size={15} />
                Apply filters
              </button>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          title="Booking queue"
          description="Private customer, address and quote detail is available on an individual record after admin authorization."
          icon={ClipboardList}
        >
          {error ? (
            <div className="grid gap-3">
              <Notice kind="error">{error}</Notice>
              <button
                type="button"
                onClick={() => setRefreshVersion((value) => value + 1)}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
              >
                <RefreshCw aria-hidden="true" size={15} />
                Retry
              </button>
            </div>
          ) : loading ? (
            <LoadingNotice label="Loading admin booking records…" />
          ) : bookings && bookings.items.length ? (
            <div className="grid gap-3">
              {bookings.items.map((booking) => (
                <article
                  key={booking.id}
                  className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold text-midnight">
                        {booking.service_title}
                      </h3>
                      <p className="mt-1 break-all text-xs text-midnight/45">{booking.id}</p>
                      <p className="mt-2 text-sm text-midnight/60">
                        {formatBookingDate(booking.preferred_date)} ·{' '}
                        {formatWindow(booking.preferred_start, booking.preferred_end)} ·{' '}
                        {booking.timezone_name}
                      </p>
                      <p className="mt-1 text-sm text-midnight/55">
                        {booking.address_locality && booking.city
                          ? `${booking.address_locality}, ${booking.city}`
                          : 'Service location'}{' '}
                        · {booking.service_slug}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <BookingStatusPill status={booking.status} />
                      {booking.escalation_status === 'escalated' ? (
                        <span className="rounded-full bg-[#fff3f1] px-3 py-1 text-xs font-semibold text-[#8d3028]">
                          Escalated
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 border-t border-midnight/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-midnight/55">
                      Assigned: {booking.assigned_technician_name ?? 'Unassigned'} ·{' '}
                      {booking.current_quote_total_paise === null
                        ? 'No quote issued'
                        : `Current quote ${formatPaise(booking.current_quote_total_paise)}`}
                    </p>
                    <Link
                      href={`/admin/bookings/${encodeURIComponent(booking.id)}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                    >
                      Review booking <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  </div>
                </article>
              ))}
              <p className="text-right text-xs text-midnight/45">
                Showing {bookings.items.length} of {bookings.total} booking(s).
              </p>
              {bookings.items.length < bookings.total ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="mx-auto inline-flex min-h-11 items-center rounded-xl border border-midnight/15 bg-white px-5 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load more bookings'}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-5 text-sm leading-6 text-midnight/60">
              No bookings match these filters. Clear filters or check again after a customer submits
              a request.
            </div>
          )}
        </DashboardCard>
      </div>
    </AdminBookingFrame>
  );
}
