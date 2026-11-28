'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { BookingLocationSharing } from '@/features/bookings/components/BookingLocationSharing';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
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
  createTechnicianQuote,
  getTechnicianBooking,
  newIdempotencyKey,
  respondToAssignment,
  transitionTechnicianBooking,
  updateTechnicianBookingVisit,
} from '@/lib/api/bookings';
import type { BookingDetail, BookingVisitStatus, QuoteLineType } from '@/lib/api/bookings';

const MAX_UNIT_PAISE = 10_000_000_000n;
const MAX_QUOTE_TOTAL_PAISE = 1_000_000_000_000n;
const quoteEditableStatuses = [
  'inspection_pending',
  'quote_pending',
  'quote_rejected',
  'approved',
] as const;
const quoteLineTypes: { value: QuoteLineType; label: string }[] = [
  { value: 'inspection', label: 'Inspection' },
  { value: 'labour', label: 'Labour' },
  { value: 'part', label: 'Part or material' },
  { value: 'additional_fee', label: 'Additional fee' },
  { value: 'tax', label: 'Tax' },
];

type QuoteLineDraft = {
  key: number;
  line_type: QuoteLineType;
  description: string;
  quantity: string;
  amount_rupees: string;
};

function newLineDraft(key: number): QuoteLineDraft {
  return { key, line_type: 'inspection', description: '', quantity: '1', amount_rupees: '' };
}

function parseRupees(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  try {
    const paise = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
    if (paise > MAX_UNIT_PAISE) return null;
    return Number(paise);
  } catch {
    return null;
  }
}

function localDateTimeInput(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function defaultQuoteExpiry(): string {
  return localDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function quoteTotal(items: QuoteLineDraft[]): number | null {
  let total = 0n;
  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitAmount = parseRupees(item.amount_rupees);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000 || unitAmount === null) {
      return null;
    }
    total += BigInt(quantity) * BigInt(unitAmount);
    if (total > MAX_QUOTE_TOTAL_PAISE) return null;
  }
  return Number(total);
}

function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

type TechnicianBookingDetailPageProps = { bookingId: string };

export function TechnicianBookingDetailPage({ bookingId }: TechnicianBookingDetailPageProps) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignmentNote, setAssignmentNote] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [declined, setDeclined] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteLineDraft[]>([newLineDraft(1)]);
  const lineKey = useRef(1);
  const [quoteExpiry, setQuoteExpiry] = useState('');
  const [visitStatusDraft, setVisitStatusDraft] = useState<BookingVisitStatus>('scheduled');
  const [visitEtaDraft, setVisitEtaDraft] = useState('');
  const [localTimezone, setLocalTimezone] = useState('device local time');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [quoteIdempotencyKey, setQuoteIdempotencyKey] = useState<string | null>(null);
  const assignmentKey = useRef<string | null>(null);
  const assignmentAction = useRef<'accept' | 'decline' | null>(null);
  const visitKey = useRef<string | null>(null);
  const transitionKeys = useRef<
    Record<'start_inspection' | 'start_work' | 'complete', string | null>
  >({
    start_inspection: null,
    start_work: null,
    complete: null,
  });

  useEffect(() => {
    setBooking(null);
    setLoadError('');
    setActionError('');
    setFeedback('');
    setDeclined(false);
    setAssignmentNote('');
    setTransitionNote('');
    setTechnicianNotes('');
    setQuoteExpiry(defaultQuoteExpiry());
    setQuoteItems([newLineDraft(1)]);
    setQuoteIdempotencyKey(null);
    setVisitStatusDraft('scheduled');
    setVisitEtaDraft('');
    lineKey.current = 1;
    assignmentKey.current = null;
    assignmentAction.current = null;
    visitKey.current = null;
    transitionKeys.current = { start_inspection: null, start_work: null, complete: null };
  }, [bookingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void getTechnicianBooking(bookingId)
      .then((result) => {
        if (!active) return;
        setBooking(result);
        setVisitStatusDraft(result.visit?.status ?? 'scheduled');
        setVisitEtaDraft(
          result.visit?.eta_at ? localDateTimeInput(new Date(result.visit.eta_at)) : '',
        );
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

  useEffect(() => {
    setLocalTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'device local time');
  }, []);

  const changeQuote = (update: (items: QuoteLineDraft[]) => QuoteLineDraft[]) => {
    setQuoteIdempotencyKey(null);
    setQuoteItems(update);
  };

  const respond = async (decision: 'accept' | 'decline') => {
    if (assignmentAction.current !== decision || !assignmentKey.current) {
      assignmentKey.current = newIdempotencyKey();
      assignmentAction.current = decision;
    }
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const result = await respondToAssignment(
        bookingId,
        decision,
        assignmentNote.trim(),
        assignmentKey.current,
      );
      if (decision === 'decline') {
        assignmentKey.current = null;
        assignmentAction.current = null;
        setDeclined(true);
        setFeedback('You declined this assignment. It has been returned to the admin queue.');
      } else {
        const updated = await getTechnicianBooking(bookingId);
        assignmentKey.current = null;
        assignmentAction.current = null;
        setBooking(updated);
        setAssignmentNote('');
        setFeedback(
          `Assignment accepted. Current booking status: ${result.status.replaceAll('_', ' ')}.`,
        );
      }
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  const transition = async (action: 'start_inspection' | 'start_work' | 'complete') => {
    transitionKeys.current[action] ??= newIdempotencyKey();
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await transitionTechnicianBooking(
        bookingId,
        action,
        transitionNote.trim(),
        transitionKeys.current[action]!,
      );
      transitionKeys.current[action] = null;
      setBooking(updated);
      setTransitionNote('');
      setFeedback(
        action === 'start_inspection'
          ? 'Inspection start recorded.'
          : action === 'start_work'
            ? 'Repair work start recorded against the approved PriceLock quote.'
            : 'Service completion recorded.',
      );
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  const saveVisit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    visitKey.current ??= newIdempotencyKey();
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updatedVisit = await updateTechnicianBookingVisit(
        bookingId,
        {
          status: visitStatusDraft,
          eta_at: visitEtaDraft ? new Date(visitEtaDraft).toISOString() : null,
        },
        visitKey.current,
      );
      visitKey.current = null;
      setBooking((current) => (current ? { ...current, visit: updatedVisit } : current));
      setFeedback('Manual visit status and ETA saved. No live location was collected.');
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  const issueQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    setFeedback('');
    if (!quoteItems.length || quoteItems.length > 40) {
      setActionError('A PriceLock quote must contain between one and 40 itemized lines.');
      return;
    }
    const items = [];
    for (const [index, item] of quoteItems.entries()) {
      const quantity = Number(item.quantity);
      const unitAmountPaise = parseRupees(item.amount_rupees);
      if (!item.description.trim() || item.description.trim().length > 240) {
        setActionError(`Add a description of up to 240 characters for line ${index + 1}.`);
        return;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
        setActionError(`Enter a whole-number quantity from 1 to 10,000 for line ${index + 1}.`);
        return;
      }
      if (unitAmountPaise === null) {
        setActionError(
          `Enter a valid amount in rupees with up to two decimal places for line ${index + 1}.`,
        );
        return;
      }
      items.push({
        line_type: item.line_type,
        description: item.description.trim(),
        quantity,
        unit_amount_paise: unitAmountPaise,
      });
    }
    const total = quoteTotal(quoteItems);
    if (total === null) {
      setActionError(
        'The itemized total is invalid or exceeds the supported limit. Review each quantity and amount.',
      );
      return;
    }
    const expiryDate = new Date(quoteExpiry);
    const now = Date.now();
    if (
      !quoteExpiry ||
      Number.isNaN(expiryDate.getTime()) ||
      expiryDate.getTime() <= now ||
      expiryDate.getTime() > now + 90 * 24 * 60 * 60 * 1000
    ) {
      setActionError('Choose an expiry between now and 90 days from now.');
      return;
    }
    const key = quoteIdempotencyKey ?? newIdempotencyKey();
    setQuoteIdempotencyKey(key);
    setBusy(true);
    try {
      const updated = await createTechnicianQuote(
        bookingId,
        {
          items,
          expires_at: expiryDate.toISOString(),
          technician_notes: technicianNotes.trim() || null,
        },
        key,
      );
      setQuoteIdempotencyKey(null);
      setBooking(updated);
      setTechnicianNotes('');
      setQuoteExpiry(defaultQuoteExpiry());
      lineKey.current += 1;
      setQuoteItems([newLineDraft(lineKey.current)]);
      setFeedback(
        `PriceLock version ${updated.quotes.find((quote) => quote.is_current)?.version ?? ''} was submitted. The customer must approve this exact version before paid repair work starts.`,
      );
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingNotice label="Loading this assigned booking from the FixNear API…" />;
  if (loadError || !booking) {
    return (
      <div className="grid gap-4">
        <DashboardPageHeader
          eyebrow="Technician · private assignment"
          title="Booking details"
          description="Only the technician currently assigned to this booking can view its customer details."
        />
        <Notice kind="error">{loadError || 'This booking is not assigned to your account.'}</Notice>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/technician/bookings"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            Assigned bookings
          </Link>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
          >
            <RefreshCw aria-hidden="true" size={15} />
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (declined) {
    return (
      <div className="grid gap-5">
        <DashboardPageHeader
          eyebrow="Technician · assignment decision"
          title={booking.service_title}
          description={`Booking ${booking.id}`}
        />
        <Notice kind="success">
          {feedback ||
            'You declined the assignment. It is no longer available in your assigned work list.'}
        </Notice>
        <Link
          href="/technician/bookings"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Return to assigned bookings
        </Link>
      </div>
    );
  }

  const currentQuote = booking.quotes.find((quote) => quote.is_current) ?? null;
  const canCreateQuote = quoteEditableStatuses.some((status) => status === booking.status);
  const canManageVisit = [
    'accepted',
    'inspection_pending',
    'quote_pending',
    'quote_rejected',
    'approved',
    'in_progress',
  ].includes(booking.status);
  const currentVisitStatus = booking.visit?.status ?? null;
  const visitStatusOptions: BookingVisitStatus[] =
    currentVisitStatus === null
      ? ['scheduled']
      : currentVisitStatus === 'scheduled'
        ? ['scheduled', 'en_route', 'cancelled']
        : currentVisitStatus === 'en_route'
          ? ['en_route', 'arrived', 'cancelled']
          : currentVisitStatus === 'arrived'
            ? ['arrived', 'completed']
            : [];

  return (
    <div className="grid gap-5">
      <DashboardPageHeader
        eyebrow="Technician · private assignment"
        title={booking.service_title}
        description={`Booking ${booking.id} · Customer ${booking.customer_display_name ?? ''}. Review the customer’s report and record only work that has actually happened.`}
        action={
          <Link
            href="/technician/bookings"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            Bookings
          </Link>
        }
      />
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {feedback ? <Notice kind="success">{feedback}</Notice> : null}

      <DashboardCard
        title="Assigned work"
        description="Assignment eligibility and state are validated by the API. A preferred time window does not indicate availability."
        icon={ClipboardList}
      >
        <div className="flex flex-wrap items-center gap-3">
          <BookingStatusPill status={booking.status} />
          <span className="text-xs text-midnight/50">
            Customer: {booking.customer_display_name ?? 'Name not provided'}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-midnight/8 pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
              Customer preferred window
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
              Current PriceLock total
            </dt>
            <dd className="mt-1 text-sm leading-6 text-midnight/75">
              {currentQuote ? formatRupees(currentQuote.total_paise) : 'No quote issued'}
            </dd>
          </div>
        </dl>
      </DashboardCard>

      {booking.address ? (
        <DashboardCard
          title="Customer issue and service address"
          description="The API discloses exact service location only after the assigned technician accepts the booking, and records each access."
          icon={MapPin}
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-midnight/75">
            {booking.problem_description}
          </p>
          <address className="mt-4 border-t border-midnight/8 pt-4 text-sm leading-6 not-italic text-midnight/70">
            <span className="font-semibold text-midnight">
              {booking.address.label} · {booking.address.recipient_name}
            </span>
            <br />
            {booking.address.address_line1}
            {booking.address.address_line2 ? `, ${booking.address.address_line2}` : ''}
            <br />
            {booking.address.locality}, {booking.address.city}, {booking.address.state}{' '}
            {booking.address.postal_code}
            {booking.address.contact_phone ? (
              <>
                <br />
                Customer contact: {booking.address.contact_phone}
              </>
            ) : null}
          </address>
        </DashboardCard>
      ) : (
        <Notice kind="info">
          The exact service address and coordinates are hidden until you accept this assignment. No
          customer location is exposed to unrelated technicians.
        </Notice>
      )}

      {canManageVisit ? <BookingLocationSharing bookingId={bookingId} viewer="technician" /> : null}

      {canManageVisit ? (
        <DashboardCard
          title="Visit status and ETA"
          description="Manual, visit-specific updates only. No background location or live technician movement is collected."
          icon={CalendarDays}
        >
          {booking.visit ? (
            <p className="text-sm leading-6 text-midnight/70">
              Current visit status:{' '}
              <strong className="capitalize">{booking.visit.status.replaceAll('_', ' ')}</strong>
              {booking.visit.eta_at && booking.visit.eta_source && booking.visit.eta_updated_at
                ? ` · ETA ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: localTimezone }).format(new Date(booking.visit.eta_at))} (${localTimezone})`
                : ' · no ETA provided'}
              {booking.visit.eta_at && booking.visit.eta_source && booking.visit.eta_updated_at
                ? ` · ${booking.visit.eta_source === 'admin_manual' ? 'Admin' : 'Technician'} estimate, updated ${new Date(booking.visit.eta_updated_at).toLocaleString()}`
                : ''}
            </p>
          ) : (
            <p className="text-sm leading-6 text-midnight/70">
              No visit status or ETA has been recorded. The customer’s preferred time window is not
              a confirmed visit.
            </p>
          )}
          {visitStatusOptions.length > 0 ? (
            <form
              onSubmit={saveVisit}
              className="mt-4 grid gap-4 border-t border-midnight/8 pt-4 sm:grid-cols-2"
            >
              <label
                htmlFor="visit-status"
                className="grid gap-2 text-xs font-semibold text-midnight/75"
              >
                Visit status
                <select
                  id="visit-status"
                  value={visitStatusDraft}
                  onChange={(event) => {
                    visitKey.current = null;
                    const status = event.currentTarget.value as BookingVisitStatus;
                    setVisitStatusDraft(status);
                    if (status !== 'scheduled' && status !== 'en_route') setVisitEtaDraft('');
                  }}
                  className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                >
                  {visitStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {visitStatusDraft === 'scheduled' || visitStatusDraft === 'en_route' ? (
                <label
                  htmlFor="visit-eta"
                  className="grid gap-2 text-xs font-semibold text-midnight/75"
                >
                  ETA · optional, your local time
                  <input
                    id="visit-eta"
                    type="datetime-local"
                    value={visitEtaDraft}
                    onChange={(event) => {
                      visitKey.current = null;
                      setVisitEtaDraft(event.currentTarget.value);
                    }}
                    className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  />
                </label>
              ) : null}
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-xs leading-5 text-midnight/50">
                  Live technician location sharing is unavailable. This form does not start GPS
                  tracking.
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Save visit update'}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-3 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-midnight/55">
              This visit is {currentVisitStatus}. Further status changes are not allowed.
            </p>
          )}
        </DashboardCard>
      ) : booking.status === 'assigned' ? (
        <Notice kind="info">
          Visit status and ETA updates are available after you accept the assignment. Live location
          sharing is unavailable.
        </Notice>
      ) : null}

      {booking.status === 'assigned' ? (
        <DashboardCard
          title="Respond to assignment"
          description="Accept only if you are eligible and willing to take this request. This is not a confirmation of the customer's preferred window."
          icon={ShieldCheck}
        >
          <label
            htmlFor="assignment-note"
            className="grid gap-2 text-sm font-semibold text-midnight"
          >
            Optional note
            <textarea
              id="assignment-note"
              value={assignmentNote}
              maxLength={500}
              onChange={(event) => {
                assignmentKey.current = null;
                assignmentAction.current = null;
                setAssignmentNote(event.currentTarget.value);
              }}
              rows={3}
              className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm font-normal leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
            />
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond('decline')}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight disabled:opacity-50"
            >
              Decline assignment
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond('accept')}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Recording response…' : 'Accept assignment'}
            </button>
          </div>
        </DashboardCard>
      ) : null}

      {booking.status === 'accepted' ||
      booking.status === 'approved' ||
      booking.status === 'in_progress' ? (
        <DashboardCard
          title="Record service progress"
          description="Each action is permission-checked and written to the booking history. Never mark a step that has not actually occurred."
          icon={ShieldCheck}
        >
          <label htmlFor="progress-note" className="grid gap-2 text-sm font-semibold text-midnight">
            Technician note · optional
            <textarea
              id="progress-note"
              value={transitionNote}
              maxLength={500}
              onChange={(event) => {
                transitionKeys.current.start_inspection = null;
                transitionKeys.current.start_work = null;
                transitionKeys.current.complete = null;
                setTransitionNote(event.currentTarget.value);
              }}
              rows={2}
              className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm font-normal leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
            />
          </label>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {booking.status === 'accepted' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void transition('start_inspection')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Start inspection'}
              </button>
            ) : null}
            {booking.status === 'approved' &&
            currentQuote?.status === 'approved' &&
            !currentQuote.is_expired ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void transition('start_work')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Start approved repair work'}
              </button>
            ) : null}
            {booking.status === 'approved' && currentQuote?.status !== 'approved' ? (
              <p className="w-full text-sm leading-6 text-midnight/60">
                Work cannot start until the customer approves the current quote version.
              </p>
            ) : null}
            {booking.status === 'in_progress' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void transition('complete')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Mark service complete'}
              </button>
            ) : null}
          </div>
        </DashboardCard>
      ) : null}

      <DashboardCard
        title="PriceLock quote versions"
        description="Enter actual inspection, labour, part, fee and tax values only. The backend calculates each line and total and requires fresh customer approval after every revision."
        icon={ShieldCheck}
      >
        {booking.quotes.length ? (
          <div className="grid gap-4">
            {booking.quotes.map((quote) => (
              <PriceLockQuoteCard key={quote.id} quote={quote} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm leading-6 text-midnight/60">
            No quote exists. No standard price is assumed; enter itemized amounts only when you have
            assessed the job.
          </p>
        )}
        {currentQuote?.status === 'approved' ? (
          <div className="mt-4">
            <Notice kind="info">
              This version was approved by the customer. If you revise it before work starts, the
              new version returns to the customer for fresh approval.
            </Notice>
          </div>
        ) : null}
        <p className="mt-4 text-xs leading-5 text-midnight/55">
          This workflow records quotations and approvals only. It does not collect payment,
          authorize a payment method, or issue a refund.
        </p>
      </DashboardCard>

      {canCreateQuote ? (
        <DashboardCard
          title={
            currentQuote
              ? `Create PriceLock revision · current version ${currentQuote.version}`
              : 'Prepare a PriceLock quote'
          }
          description="Include a separate line for each inspection, labour item, part or quantity, additional fee, and tax. The customer must decide on the submitted version."
          icon={ClipboardList}
        >
          <form onSubmit={issueQuote} noValidate className="grid gap-5">
            <div className="grid gap-3">
              {quoteItems.map((item, index) => (
                <fieldset
                  key={item.key}
                  className="grid gap-3 rounded-xl border border-midnight/10 bg-[#fbfcfa] p-4 sm:grid-cols-2 sm:p-5"
                >
                  <legend className="px-1 text-sm font-semibold text-midnight">
                    Line item {index + 1}
                  </legend>
                  <div className="grid gap-2">
                    <label
                      htmlFor={`quote-type-${item.key}`}
                      className="text-xs font-semibold text-midnight/75"
                    >
                      Type
                    </label>
                    <select
                      id={`quote-type-${item.key}`}
                      value={item.line_type}
                      onChange={(event) => {
                        const lineType = event.currentTarget.value as QuoteLineType;
                        changeQuote((items) =>
                          items.map((line) =>
                            line.key === item.key ? { ...line, line_type: lineType } : line,
                          ),
                        );
                      }}
                      className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                    >
                      {quoteLineTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor={`quote-quantity-${item.key}`}
                      className="text-xs font-semibold text-midnight/75"
                    >
                      Quantity
                    </label>
                    <input
                      id={`quote-quantity-${item.key}`}
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      value={item.quantity}
                      onChange={(event) => {
                        const quantity = event.currentTarget.value;
                        changeQuote((items) =>
                          items.map((line) =>
                            line.key === item.key ? { ...line, quantity } : line,
                          ),
                        );
                      }}
                      className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <label
                      htmlFor={`quote-description-${item.key}`}
                      className="text-xs font-semibold text-midnight/75"
                    >
                      Description
                    </label>
                    <input
                      id={`quote-description-${item.key}`}
                      required
                      maxLength={240}
                      value={item.description}
                      onChange={(event) => {
                        const description = event.currentTarget.value;
                        changeQuote((items) =>
                          items.map((line) =>
                            line.key === item.key ? { ...line, description } : line,
                          ),
                        );
                      }}
                      placeholder="Describe the inspection, labour, part, or charge"
                      className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none placeholder:text-midnight/35 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor={`quote-amount-${item.key}`}
                      className="text-xs font-semibold text-midnight/75"
                    >
                      Unit amount · INR
                    </label>
                    <input
                      id={`quote-amount-${item.key}`}
                      required
                      inputMode="decimal"
                      maxLength={14}
                      value={item.amount_rupees}
                      onChange={(event) => {
                        const amountRupees = event.currentTarget.value;
                        changeQuote((items) =>
                          items.map((line) =>
                            line.key === item.key ? { ...line, amount_rupees: amountRupees } : line,
                          ),
                        );
                      }}
                      placeholder="e.g. 850.00"
                      className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none placeholder:text-midnight/35 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                    />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <p className="pb-3 text-xs leading-5 text-midnight/50">
                      Line amount:{' '}
                      {parseRupees(item.amount_rupees) !== null &&
                      Number.isInteger(Number(item.quantity)) &&
                      Number(item.quantity) > 0
                        ? formatRupees(parseRupees(item.amount_rupees)! * Number(item.quantity))
                        : '—'}
                    </p>
                    <button
                      type="button"
                      disabled={quoteItems.length <= 1}
                      onClick={() =>
                        changeQuote((items) => items.filter((line) => line.key !== item.key))
                      }
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                      Remove
                    </button>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                disabled={quoteItems.length >= 40}
                onClick={() => {
                  lineKey.current += 1;
                  changeQuote((items) => [...items, newLineDraft(lineKey.current)]);
                }}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] disabled:opacity-50"
              >
                <Plus aria-hidden="true" size={16} />
                Add line item
              </button>
            </div>

            <div className="grid gap-4 border-t border-midnight/8 pt-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="quote-expiry" className="text-sm font-semibold text-midnight">
                  Quote expires · your local time ({localTimezone})
                </label>
                <input
                  id="quote-expiry"
                  type="datetime-local"
                  required
                  value={quoteExpiry}
                  onChange={(event) => {
                    setQuoteIdempotencyKey(null);
                    setQuoteExpiry(event.currentTarget.value);
                  }}
                  className="min-h-12 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                />
                <p className="text-xs leading-5 text-midnight/50">
                  Default: 24 hours from now. The expiry is part of this quote version.
                </p>
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="technician-quote-notes"
                  className="text-sm font-semibold text-midnight"
                >
                  Technician notes · optional
                </label>
                <textarea
                  id="technician-quote-notes"
                  rows={3}
                  maxLength={2000}
                  value={technicianNotes}
                  onChange={(event) => {
                    setQuoteIdempotencyKey(null);
                    setTechnicianNotes(event.currentTarget.value);
                  }}
                  className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-xl bg-[#f8faf7] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                  Calculated quote total
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-midnight">
                  {quoteTotal(quoteItems) === null
                    ? 'Complete valid line items'
                    : formatRupees(quoteTotal(quoteItems)!)}
                </p>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-midnight px-5 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-wait disabled:opacity-60"
              >
                {busy
                  ? 'Submitting quote…'
                  : currentQuote
                    ? 'Submit revised quote'
                    : 'Submit PriceLock quote'}
              </button>
            </div>
            <p className="text-xs leading-5 text-midnight/50">
              The server recalculates all line totals and stores this as a new version. A quote
              revision requires a fresh customer approval. No payment is taken.
            </p>
          </form>
        </DashboardCard>
      ) : null}

      {booking.status === 'completed' || booking.status === 'cancelled' ? (
        <Notice kind="info">
          This booking is closed. No further work transitions or quote changes are available.
        </Notice>
      ) : null}

      <DashboardCard
        title="Booking activity"
        description="Technician-visible event sequence. Admin-only notes and escalation events are hidden."
        icon={CalendarDays}
      >
        <BookingTimeline events={booking.events} />
      </DashboardCard>
    </div>
  );
}
