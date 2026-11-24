'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, ClipboardList, RefreshCw } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { BookingFrame } from '@/features/bookings/components/BookingFrame';
import {
  BookingStatusPill,
  formatBookingDate,
  formatPaise,
  formatWindow,
  LoadingNotice,
  messageForBookingError,
  Notice,
} from '@/features/bookings/components/booking-ui';
import { listCustomerBookings } from '@/lib/api/bookings';
import type { BookingList } from '@/lib/api/bookings';

const PAGE_SIZE = 20;

export function CustomerBookingListPage() {
  const [bookings, setBookings] = useState<BookingList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setBookings(await listCustomerBookings(undefined, { limit: PAGE_SIZE, offset: 0 }));
    } catch (requestError) {
      setBookings(null);
      setError(messageForBookingError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!bookings || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const next = await listCustomerBookings(undefined, {
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

  useEffect(() => {
    let active = true;
    void listCustomerBookings(undefined, { limit: PAGE_SIZE, offset: 0 })
      .then((result) => {
        if (active) setBookings(result);
      })
      .catch((requestError: unknown) => {
        if (active) setError(messageForBookingError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <BookingFrame>
      <DashboardPageHeader
        eyebrow="Customer · private service requests"
        title="Your service requests."
        description="Review request status, preferred windows and PriceLock quote decisions. Requested times are not confirmed appointments."
        action={
          <Button href="/bookings/new" size="small">
            New request <ArrowRight aria-hidden="true" size={15} />
          </Button>
        }
      />

      {error ? (
        <div className="grid gap-4">
          <Notice kind="error">{error}</Notice>
          <div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              <RefreshCw aria-hidden="true" size={15} />
              Retry
            </button>
          </div>
        </div>
      ) : loading ? (
        <LoadingNotice label="Loading your private service requests…" />
      ) : bookings && bookings.items.length > 0 ? (
        <div className="grid gap-4">
          {bookings.items.map((booking) => (
            <Link
              key={booking.id}
              href={`/bookings/${encodeURIComponent(booking.id)}`}
              className="group rounded-2xl border border-midnight/10 bg-white p-5 shadow-[0_8px_30px_rgba(16,24,39,0.035)] transition hover:border-midnight/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight sm:p-6"
            >
              <span className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold text-midnight">
                    {booking.service_title}
                  </span>
                  <span className="mt-2 block text-sm text-midnight/60">
                    {formatBookingDate(booking.preferred_date)} ·{' '}
                    {formatWindow(booking.preferred_start, booking.preferred_end)} ·{' '}
                    {booking.timezone_name}
                  </span>
                  <span className="mt-1 block text-sm text-midnight/55">
                    {booking.address_locality && booking.city
                      ? `${booking.address_locality}, ${booking.city}`
                      : 'Service location'}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <BookingStatusPill status={booking.status} />
                  {booking.escalation_status === 'escalated' ? (
                    <span className="rounded-full bg-[#fff3f1] px-3 py-1 text-xs font-semibold text-[#8d3028]">
                      Admin escalation
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="mt-4 flex flex-col gap-2 border-t border-midnight/8 pt-4 text-xs text-midnight/55 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays aria-hidden="true" size={14} />
                  Preferred window · not confirmed
                </span>
                <span className="inline-flex items-center gap-2">
                  {booking.current_quote_total_paise !== null
                    ? `Current quote · ${formatPaise(booking.current_quote_total_paise)}`
                    : 'No quote issued yet'}
                  <ArrowRight
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-0.5"
                    size={14}
                  />
                </span>
              </span>
            </Link>
          ))}
          <p className="text-right text-xs text-midnight/45">
            Showing {bookings.items.length} of {bookings.total} request(s).
          </p>
          {bookings.items.length < bookings.total ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="mx-auto inline-flex min-h-11 items-center justify-center rounded-xl border border-midnight/15 bg-white px-5 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-60"
            >
              {loadingMore ? 'Loading older requests…' : 'Load older requests'}
            </button>
          ) : null}
        </div>
      ) : (
        <DashboardCard
          title="No service requests yet"
          description="Your requests will appear here after you submit one."
          icon={ClipboardList}
        >
          <p className="text-sm leading-6 text-midnight/65">
            There is no demo booking history in this view.
          </p>
          <Button href="/services" variant="secondary" className="mt-5">
            Choose an active service guide
          </Button>
        </DashboardCard>
      )}
    </BookingFrame>
  );
}
