'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CalendarDays, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { BookingFrame } from '@/features/bookings/components/BookingFrame';
import {
  BookingStatusPill,
  BookingTimeline,
  formatBookingDate,
  formatWindow,
  LoadingNotice,
  messageForBookingError,
  Notice,
  PriceLockQuoteCard,
} from '@/features/bookings/components/booking-ui';
import {
  cancelCustomerBooking,
  decideCustomerQuote,
  getCustomerBooking,
  newIdempotencyKey,
} from '@/lib/api/bookings';
import type { BookingDetail, BookingStatus } from '@/lib/api/bookings';

type CustomerBookingDetailPageProps = { bookingId: string };

const customerCancellableStatuses: BookingStatus[] = [
  'requested',
  'assigned',
  'accepted',
  'inspection_pending',
  'quote_pending',
  'quote_rejected',
  'approved',
];

export function CustomerBookingDetailPage({ bookingId }: CustomerBookingDetailPageProps) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelKey = useRef<string | null>(null);
  const quoteDecisionKey = useRef<string | null>(null);
  const quoteDecisionAction = useRef<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    setBooking(null);
    setActionError('');
    setFeedback('');
    setCancelReason('');
    setDecisionNote('');
    cancelKey.current = null;
    quoteDecisionKey.current = null;
    quoteDecisionAction.current = null;
  }, [bookingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void getCustomerBooking(bookingId)
      .then((result) => {
        if (active) setBooking(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBooking(null);
        setLoadError(messageForBookingError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookingId, loadAttempt]);

  const cancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 5) {
      setActionError('Add a cancellation reason of at least five characters.');
      return;
    }
    cancelKey.current ??= newIdempotencyKey();
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await cancelCustomerBooking(bookingId, reason, cancelKey.current);
      cancelKey.current = null;
      setBooking(updated);
      setCancelReason('');
      setFeedback(
        'Your service request was cancelled. The cancellation is recorded in its history.',
      );
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  const decideQuote = async (quoteId: string, decision: 'approved' | 'rejected') => {
    const note = decisionNote.trim();
    if (decision === 'rejected' && note.length < 5) {
      setActionError('Add a short reason of at least five characters before declining the quote.');
      return;
    }
    if (note && note.length < 5) {
      setActionError('A quote note must be at least five characters, or leave it blank.');
      return;
    }
    if (quoteDecisionAction.current !== decision || !quoteDecisionKey.current) {
      quoteDecisionKey.current = newIdempotencyKey();
      quoteDecisionAction.current = decision;
    }
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await decideCustomerQuote(
        bookingId,
        quoteId,
        decision,
        note,
        quoteDecisionKey.current,
      );
      quoteDecisionKey.current = null;
      setBooking(updated);
      setDecisionNote('');
      setFeedback(
        decision === 'approved'
          ? 'Your approval of this PriceLock version is recorded. The technician can now proceed with the approved scope.'
          : 'Your decision was recorded. A revised quote requires your fresh approval before paid work starts.',
      );
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <BookingFrame>
        <LoadingNotice label="Loading your private service request…" />
      </BookingFrame>
    );
  }

  if (loadError || !booking) {
    return (
      <BookingFrame narrow>
        <DashboardPageHeader
          eyebrow="Customer · private request"
          title="Service request details"
          description="Booking addresses and service notes are visible only to the customer who owns the request and authorized service roles."
        />
        <div className="grid gap-4">
          <Notice kind="error">
            {loadError || 'This service request is not available to your account.'}
          </Notice>
          <div className="flex flex-wrap gap-3">
            <Button href="/bookings" variant="secondary">
              <ArrowLeft aria-hidden="true" size={15} /> My requests
            </Button>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              <RefreshCw aria-hidden="true" size={15} />
              Refresh
            </button>
          </div>
        </div>
      </BookingFrame>
    );
  }

  const canCancel = customerCancellableStatuses.includes(booking.status);
  const currentQuote = booking.quotes.find((quote) => quote.is_current) ?? null;
  const canDecideQuote =
    booking.status === 'quote_pending' &&
    currentQuote?.status === 'pending' &&
    !currentQuote.is_expired;
  const address = booking.address;

  return (
    <BookingFrame narrow>
      <DashboardPageHeader
        eyebrow="Customer · private service request"
        title={booking.service_title}
        description={`Request ${booking.id} · Submitted ${formatBookingDate(booking.created_at.slice(0, 10))}. Review the status, proposed scope, and activity recorded for this request.`}
        action={
          <Button href="/bookings" variant="secondary" size="small">
            <ArrowLeft aria-hidden="true" size={15} /> My requests
          </Button>
        }
      />

      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {feedback ? (
        <div className="mt-4">
          <Notice kind="success">{feedback}</Notice>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5">
        <DashboardCard
          title="Request status"
          description="The preferred time is a request, not an appointment confirmation. A technician is not matched automatically."
          icon={ShieldCheck}
        >
          <div className="flex flex-wrap items-center gap-3">
            <BookingStatusPill status={booking.status} />
            {booking.escalation_status === 'escalated' ? (
              <span className="rounded-full bg-[#fff3f1] px-3 py-1 text-xs font-semibold text-[#8d3028]">
                Being reviewed by FixNear support
              </span>
            ) : null}
          </div>
          <dl className="mt-5 grid gap-4 border-t border-midnight/8 pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Preferred window
              </dt>
              <dd className="mt-1 flex items-start gap-2 text-sm leading-6 text-midnight/75">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-midnight/45"
                  size={15}
                />
                {formatBookingDate(booking.preferred_date)} ·{' '}
                {formatWindow(booking.preferred_start, booking.preferred_end)} ·{' '}
                {booking.timezone_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Assigned technician
              </dt>
              <dd className="mt-1 text-sm leading-6 text-midnight/75">
                {booking.assigned_technician_name ?? 'Not assigned yet'}
              </dd>
            </div>
          </dl>
          {booking.status === 'approved' ? (
            <p className="mt-4 rounded-xl border border-[#cbe7ae] bg-[#eef7e5] p-3 text-sm leading-6 text-midnight/75">
              The current PriceLock quotation has been approved. Paid repair work still starts only
              after the assigned technician records that work has begun.
            </p>
          ) : null}
          {booking.status === 'quote_rejected' ? (
            <p className="mt-4 rounded-xl border border-midnight/10 bg-[#f8faf7] p-3 text-sm leading-6 text-midnight/65">
              The latest quote was declined. Any revised version will need a fresh decision from
              you.
            </p>
          ) : null}
        </DashboardCard>

        <DashboardCard
          title="Technician visit status and ETA"
          description="Visit updates are submitted manually for this booking. FixNear does not track technician movement in the background."
          icon={CalendarDays}
        >
          {booking.visit ? (
            <p className="text-sm leading-6 text-midnight/75">
              Status:{' '}
              <strong className="capitalize">{booking.visit.status.replaceAll('_', ' ')}</strong>
              {booking.visit.eta_at
                ? ` · ETA ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.visit.eta_at))} (device local time)`
                : ' · no ETA provided'}
            </p>
          ) : (
            <p className="text-sm leading-6 text-midnight/65">
              No visit status or ETA has been recorded. Your preferred window is not a confirmed
              appointment.
            </p>
          )}
          <p className="mt-3 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-midnight/55">
            Live technician location sharing is unavailable. No live movement is shown or collected.
          </p>
        </DashboardCard>

        {address ? (
          <DashboardCard
            title="Service address and issue"
            description="These details are part of your private booking record."
            icon={MapPin}
          >
            <address className="not-italic text-sm leading-6 text-midnight/75">
              <span className="font-semibold text-midnight">
                {address.label} · {address.recipient_name}
              </span>
              <br />
              {address.address_line1}
              {address.address_line2 ? `, ${address.address_line2}` : ''}
              <br />
              {address.locality}, {address.city}, {address.state} {address.postal_code}
              {address.contact_phone ? (
                <>
                  <br />
                  Contact phone: {address.contact_phone}
                </>
              ) : null}
            </address>
            <div className="mt-5 border-t border-midnight/8 pt-4">
              <h3 className="text-sm font-semibold text-midnight">Issue description</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-midnight/70">
                {booking.problem_description}
              </p>
            </div>
            {booking.cancellation_reason ? (
              <p className="mt-4 rounded-xl bg-[#f8faf7] p-3 text-sm leading-6 text-midnight/65">
                <span className="font-semibold text-midnight">Cancellation note: </span>
                {booking.cancellation_reason}
              </p>
            ) : null}
          </DashboardCard>
        ) : (
          <Notice kind="error">
            The private service address is unavailable in this booking response.
          </Notice>
        )}

        <DashboardCard
          title="PriceLock quote history"
          description="Each version is itemized. The total is the technician's proposal, not a payment or an automatic work authorization."
          icon={ShieldCheck}
        >
          {booking.quotes.length > 0 ? (
            <div className="grid gap-4">
              {booking.quotes.map((quote) => (
                <PriceLockQuoteCard
                  key={quote.id}
                  quote={quote}
                  actions={
                    canDecideQuote && quote.id === currentQuote?.id ? (
                      <div>
                        <p className="text-xs leading-5 text-midnight/60">
                          Review the exact scope above. Approval is specific to this version; a
                          revised quote will need a new decision. No payment is collected here.
                        </p>
                        <label
                          htmlFor="quote-decision-note"
                          className="mt-4 grid gap-1.5 text-sm font-semibold text-midnight"
                        >
                          Note · required when declining
                          <textarea
                            id="quote-decision-note"
                            value={decisionNote}
                            maxLength={1000}
                            onChange={(event) => {
                              quoteDecisionKey.current = null;
                              setDecisionNote(event.currentTarget.value);
                            }}
                            rows={3}
                            className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm font-normal leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                          />
                        </label>
                        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void decideQuote(quote.id, 'rejected')}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d99b93] px-4 text-sm font-semibold text-[#8d3028] disabled:opacity-50"
                          >
                            Decline quote
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void decideQuote(quote.id, 'approved')}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy ? 'Recording decision…' : 'Approve this quote'}
                          </button>
                        </div>
                      </div>
                    ) : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm leading-6 text-midnight/60">
              No PriceLock quotation has been issued. No price is estimated or shown until the
              technician submits an itemized proposal.
            </p>
          )}
          {currentQuote?.is_expired ? (
            <div className="mt-4">
              <Notice kind="info">
                This current quote has expired. Ask the technician for a revised version before
                making a decision.
              </Notice>
            </div>
          ) : null}
        </DashboardCard>

        <DashboardCard
          title="Request history"
          description="Events are shown in recorded sequence. Notes are limited to information visible to you."
          icon={CalendarDays}
        >
          <BookingTimeline events={booking.events} />
        </DashboardCard>

        {canCancel ? (
          <DashboardCard
            title="Cancel this request"
            description="Customers may cancel before paid work begins. Once repair work has started, contact FixNear support instead."
            icon={RefreshCw}
          >
            <form onSubmit={cancel} noValidate>
              <label
                htmlFor="cancel-reason"
                className="grid gap-2 text-sm font-semibold text-midnight"
              >
                Reason for cancellation
                <textarea
                  id="cancel-reason"
                  minLength={5}
                  maxLength={1000}
                  required
                  value={cancelReason}
                  onChange={(event) => {
                    cancelKey.current = null;
                    setCancelReason(event.currentTarget.value);
                  }}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm font-normal leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d99b93] px-4 text-sm font-semibold text-[#8d3028] hover:bg-[#fff3f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
              >
                {busy ? 'Cancelling…' : 'Cancel service request'}
              </button>
            </form>
          </DashboardCard>
        ) : booking.status === 'in_progress' ? (
          <Notice kind="info">
            This request is already in progress. The customer cancellation window has closed;
            contact FixNear support if you need help.
          </Notice>
        ) : null}
      </div>
    </BookingFrame>
  );
}
