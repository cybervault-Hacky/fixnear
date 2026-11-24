'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ClipboardList, MapPin, RefreshCw } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  BookingStatusPill,
  formatBookingDate,
  formatPaise,
  formatWindow,
  LoadingNotice,
  messageForBookingError,
  Notice,
} from '@/features/bookings/components/booking-ui';
import { listTechnicianBookings } from '@/lib/api/bookings';
import type { BookingList, BookingStatus } from '@/lib/api/bookings';

const PAGE_SIZE = 25;
const statusFilters: { value: '' | BookingStatus; label: string }[] = [
  { value: '', label: 'All assigned work' },
  { value: 'assigned', label: 'Awaiting my response' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'inspection_pending', label: 'Inspection' },
  { value: 'quote_pending', label: 'Quote pending' },
  { value: 'quote_rejected', label: 'Quote declined' },
  { value: 'approved', label: 'Quote approved' },
  { value: 'in_progress', label: 'Repair in progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function TechnicianBookingListPage() {
  const [status, setStatus] = useState<'' | BookingStatus>('');
  const [bookings, setBookings] = useState<BookingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void listTechnicianBookings(status || undefined, { limit: PAGE_SIZE, offset: 0 })
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
  }, [status, refreshVersion]);

  const loadMore = async () => {
    if (!bookings || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const next = await listTechnicianBookings(status || undefined, {
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

  return (
    <>
      <DashboardPageHeader
        eyebrow="Technician · assigned bookings"
        title="Your assigned service requests."
        description="Review work assigned to your authenticated technician account. Customer time preferences are not confirmed appointments, and nothing is routed to you automatically."
      />

      <DashboardCard
        title="Assignment queue"
        description="Only server-authorized assignments for this technician are displayed."
        icon={ClipboardList}
      >
        <div className="grid gap-2 sm:max-w-sm">
          <label
            htmlFor="technician-booking-filter"
            className="text-sm font-semibold text-midnight"
          >
            Filter by booking status
          </label>
          <select
            id="technician-booking-filter"
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value as '' | BookingStatus)}
            className="min-h-12 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
          >
            {statusFilters.map((filter) => (
              <option key={filter.value || 'all'} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="mt-5 grid gap-3">
            <Notice kind="error">{error}</Notice>
            <button
              type="button"
              onClick={() => setRefreshVersion((value) => value + 1)}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              <RefreshCw aria-hidden="true" size={15} />
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="mt-5">
            <LoadingNotice label="Loading assigned work from the FixNear API…" />
          </div>
        ) : bookings && bookings.items.length ? (
          <div className="mt-5 grid gap-3">
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
                    <p className="mt-1 text-xs text-midnight/50">Booking · {booking.id}</p>
                    <dl className="mt-3 grid gap-2 text-sm text-midnight/65 sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <CalendarDays aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                        <span>
                          {formatBookingDate(booking.preferred_date)} ·{' '}
                          {formatWindow(booking.preferred_start, booking.preferred_end)} ·{' '}
                          {booking.timezone_name}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                        <span>
                          {booking.address_locality && booking.city
                            ? `${booking.address_locality}, ${booking.city}`
                            : booking.status === 'assigned'
                              ? 'Location shared after you accept the assignment.'
                              : 'Open booking details to view the service location.'}
                        </span>
                      </div>
                    </dl>
                  </div>
                  <BookingStatusPill status={booking.status} />
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-midnight/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-midnight/55">
                    {booking.status === 'assigned'
                      ? 'Your response is required before this assignment is accepted.'
                      : booking.current_quote_total_paise !== null
                        ? `Current quote · ${formatPaise(booking.current_quote_total_paise)}`
                        : 'No quotation has been issued.'}
                  </p>
                  <Link
                    href={`/technician/bookings/${encodeURIComponent(booking.id)}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                  >
                    {booking.status === 'assigned' ? 'Review assignment' : 'Open booking'}{' '}
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                </div>
              </article>
            ))}
            <p className="text-right text-xs text-midnight/45">
              Showing {bookings.items.length} of {bookings.total} assigned booking(s).
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
          <div className="mt-5">
            <DashboardCard
              title="No matching assigned bookings"
              description="New work appears here only after an authorized admin assigns it to your account."
              icon={CalendarDays}
            >
              <p className="text-sm leading-6 text-midnight/65">
                A customer’s preferred time is not a guarantee of technician availability. No
                automatic matching or availability claim is made.
              </p>
            </DashboardCard>
          </div>
        )}
      </DashboardCard>
      <p className="mt-5 inline-flex items-center gap-2 text-xs leading-5 text-midnight/50">
        <ClipboardList aria-hidden="true" size={14} />
        No payment collection or customer payment details are available in this workflow.
      </p>
    </>
  );
}
