'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminBookingFrame } from '@/features/bookings/components/AdminBookingFrame';
import {
  BookingStatusPill,
  BookingTimeline,
  formatBookingDate,
  formatPaise,
  formatWindow,
  LoadingNotice,
  messageForBookingError,
  Notice,
  PriceLockQuoteCard,
} from '@/features/bookings/components/booking-ui';
import {
  assignAdminBooking,
  cancelAdminBooking,
  getAdminBooking,
  listEligibleTechnicians,
  newIdempotencyKey,
  updateAdminBookingEscalation,
  updateAdminBookingVisit,
} from '@/lib/api/bookings';
import type { BookingDetail, BookingVisitStatus, EligibleTechnician } from '@/lib/api/bookings';

function localDateTimeInput(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

type AdminBookingDetailPageProps = { bookingId: string };

export function AdminBookingDetailPage({ bookingId }: AdminBookingDetailPageProps) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [eligibleTechnicians, setEligibleTechnicians] = useState<EligibleTechnician[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [visitStatusDraft, setVisitStatusDraft] = useState<BookingVisitStatus>('scheduled');
  const [visitEtaDraft, setVisitEtaDraft] = useState('');
  const [localTimezone, setLocalTimezone] = useState('device local time');
  const assignKey = useRef<string | null>(null);
  const cancelKey = useRef<string | null>(null);
  const escalationKey = useRef<string | null>(null);
  const visitKey = useRef<string | null>(null);

  useEffect(() => {
    setBooking(null);
    setEligibleTechnicians([]);
    setEligibleLoading(false);
    setEligibleError('');
    setActionError('');
    setFeedback('');
    setSelectedTechnician('');
    setAssignmentNote('');
    setCancelReason('');
    setEscalationReason('');
    setVisitStatusDraft('scheduled');
    setVisitEtaDraft('');
    assignKey.current = null;
    cancelKey.current = null;
    escalationKey.current = null;
    visitKey.current = null;
  }, [bookingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void getAdminBooking(bookingId)
      .then((result) => {
        if (!active) return;
        setBooking(result);
        setVisitStatusDraft(result.visit?.status ?? 'scheduled');
        setVisitEtaDraft(
          result.visit?.eta_at ? localDateTimeInput(new Date(result.visit.eta_at)) : '',
        );
        setEligibleTechnicians([]);
        setEligibleError('');
        if (result.status === 'requested' || result.status === 'assigned') {
          setEligibleLoading(true);
          void listEligibleTechnicians(bookingId)
            .then((technicians) => {
              if (active) setEligibleTechnicians(technicians);
            })
            .catch((error: unknown) => {
              if (active) setEligibleError(messageForBookingError(error));
            })
            .finally(() => {
              if (active) setEligibleLoading(false);
            });
        } else {
          setEligibleLoading(false);
        }
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

  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTechnician) {
      setActionError('Choose an eligible technician before assigning this booking.');
      return;
    }
    assignKey.current ??= newIdempotencyKey();
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await assignAdminBooking(
        bookingId,
        selectedTechnician,
        assignmentNote.trim(),
        assignKey.current,
      );
      assignKey.current = null;
      setBooking(updated);
      setSelectedTechnician('');
      setAssignmentNote('');
      setFeedback(
        `Assignment recorded for ${updated.assigned_technician_name ?? 'the selected technician'}. The customer’s requested window remains unconfirmed.`,
      );
      setEligibleLoading(true);
      try {
        setEligibleTechnicians(await listEligibleTechnicians(bookingId));
        setEligibleError('');
      } catch (error) {
        setEligibleError(messageForBookingError(error));
      } finally {
        setEligibleLoading(false);
      }
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 5) {
      setActionError('Enter a cancellation reason of at least five characters.');
      return;
    }
    cancelKey.current ??= newIdempotencyKey();
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await cancelAdminBooking(bookingId, reason, cancelKey.current);
      cancelKey.current = null;
      setBooking(updated);
      setCancelReason('');
      setFeedback('Admin cancellation recorded in the booking history.');
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  const updateEscalation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = escalationReason.trim();
    if (reason.length < 5) {
      setActionError('Enter an escalation or resolution note of at least five characters.');
      return;
    }
    const status = booking?.escalation_status === 'escalated' ? 'resolved' : 'escalated';
    escalationKey.current ??= newIdempotencyKey();
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await updateAdminBookingEscalation(
        bookingId,
        status,
        reason,
        escalationKey.current,
      );
      escalationKey.current = null;
      setBooking(updated);
      setEscalationReason('');
      setFeedback(
        status === 'resolved' ? 'Escalation marked resolved.' : 'Admin escalation recorded.',
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
      const updatedVisit = await updateAdminBookingVisit(
        bookingId,
        {
          status: visitStatusDraft,
          eta_at: visitEtaDraft ? new Date(visitEtaDraft).toISOString() : null,
        },
        visitKey.current,
      );
      visitKey.current = null;
      setBooking((current) => (current ? { ...current, visit: updatedVisit } : current));
      setVisitStatusDraft(updatedVisit.status);
      setVisitEtaDraft(
        updatedVisit.eta_at ? localDateTimeInput(new Date(updatedVisit.eta_at)) : '',
      );
      setFeedback('Manual visit status and ETA saved. No live location was collected.');
      try {
        setBooking(await getAdminBooking(bookingId));
      } catch {
        setFeedback(
          'Manual visit update saved. Refresh this record to include its new audit event in the history.',
        );
      }
    } catch (error) {
      setActionError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminBookingFrame>
        <LoadingNotice label="Loading private booking and audit data…" />
      </AdminBookingFrame>
    );
  }
  if (loadError || !booking) {
    return (
      <AdminBookingFrame>
        <DashboardPageHeader
          eyebrow="Admin · private booking"
          title="Booking details"
          description="Admin access is verified by the backend for every request."
        />
        <div className="grid gap-4">
          <Notice kind="error">{loadError || 'This booking is not available.'}</Notice>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/bookings"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
            >
              <ArrowLeft aria-hidden="true" size={15} />
              Booking queue
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
      </AdminBookingFrame>
    );
  }

  const canAssign = booking.status === 'requested' || booking.status === 'assigned';
  const canCancel = booking.status !== 'completed' && booking.status !== 'cancelled';
  const canUpdateVisit = [
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
  const escalationAction = booking.escalation_status === 'escalated' ? 'resolved' : 'escalated';

  return (
    <AdminBookingFrame>
      <DashboardPageHeader
        eyebrow="Admin · private booking oversight"
        title={booking.service_title}
        description={`Booking ${booking.id} · Created ${formatBookingDate(booking.created_at.slice(0, 10))}. Review the private customer record, control assignment, inspect quote versions, and preserve the audit sequence.`}
        action={
          <Link
            href="/admin/bookings"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-semibold text-midnight hover:bg-[#f4f6f8]"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            All bookings
          </Link>
        }
      />
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {feedback ? (
        <div className="mt-4">
          <Notice kind="success">{feedback}</Notice>
        </div>
      ) : null}

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-5">
        <DashboardCard
          title="Booking overview"
          description="The customer’s preferred window is not a confirmed appointment or technician availability."
          icon={ClipboardList}
        >
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusPill status={booking.status} />
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${booking.escalation_status === 'escalated' ? 'bg-[#fff3f1] text-[#8d3028]' : 'bg-[#f1f3f5] text-midnight/60'}`}
            >
              Escalation · {booking.escalation_status}
            </span>
          </div>
          <dl className="mt-5 grid gap-4 border-t border-midnight/8 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Customer
              </dt>
              <dd className="mt-1 text-sm text-midnight/75">
                {booking.customer_display_name ?? 'Name not provided'}
              </dd>
              <dd className="mt-1 break-all text-xs text-midnight/45">
                {booking.customer_user_id}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Preferred date and time
              </dt>
              <dd className="mt-1 text-sm leading-6 text-midnight/75">
                {formatBookingDate(booking.preferred_date)} ·{' '}
                {formatWindow(booking.preferred_start, booking.preferred_end)} ·{' '}
                {booking.timezone_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Current quote
              </dt>
              <dd className="mt-1 text-sm text-midnight/75">
                {booking.current_quote_total_paise === null
                  ? 'No quote yet'
                  : `${formatPaise(booking.current_quote_total_paise)} · ${booking.current_quote_status ?? 'status unavailable'}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Assigned technician
              </dt>
              <dd className="mt-1 text-sm text-midnight/75">
                {booking.assigned_technician_name ?? 'Unassigned'}
              </dd>
              {booking.assigned_technician_user_id ? (
                <dd className="mt-1 break-all text-xs text-midnight/45">
                  {booking.assigned_technician_user_id}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Service guide
              </dt>
              <dd className="mt-1 text-sm text-midnight/75">
                {booking.service_title} · {booking.service_slug}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/45">
                Record version
              </dt>
              <dd className="mt-1 text-sm tabular-nums text-midnight/75">{booking.version}</dd>
            </div>
          </dl>
        </DashboardCard>

        <DashboardCard
          title="Customer report and private service address"
          description="This section contains private customer and location details."
          icon={MapPin}
        >
          <h3 className="text-sm font-semibold text-midnight">Issue description</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-midnight/70">
            {booking.problem_description}
          </p>
          {booking.address ? (
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
                  Contact phone: {booking.address.contact_phone}
                </>
              ) : null}
            </address>
          ) : (
            <p className="mt-4 border-t border-midnight/8 pt-4 text-sm text-midnight/55">
              The exact customer service address is unavailable in this response.
            </p>
          )}
          {booking.cancellation_reason ? (
            <p className="mt-4 rounded-xl bg-[#f8faf7] p-3 text-sm leading-6 text-midnight/65">
              <span className="font-semibold text-midnight">Cancellation reason: </span>
              {booking.cancellation_reason}
            </p>
          ) : null}
          {booking.escalation_reason ? (
            <p className="mt-3 rounded-xl bg-[#fff8e8] p-3 text-sm leading-6 text-midnight/65">
              <span className="font-semibold text-midnight">Current escalation note: </span>
              {booking.escalation_reason}
            </p>
          ) : null}
        </DashboardCard>

        <DashboardCard
          title="Manual visit status and ETA"
          description="Authorized admin updates are recorded against this booking. The preferred window is not a confirmed appointment, and FixNear does not collect live technician location."
          icon={CalendarDays}
        >
          {booking.visit ? (
            <p className="text-sm leading-6 text-midnight/70">
              Current visit status:{' '}
              <strong className="capitalize">{booking.visit.status.replaceAll('_', ' ')}</strong>
              {booking.visit.eta_at
                ? ` · ETA ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: localTimezone }).format(new Date(booking.visit.eta_at))} (${localTimezone})`
                : ' · no ETA provided'}
            </p>
          ) : (
            <p className="text-sm leading-6 text-midnight/70">
              No manual visit status or ETA has been recorded.
            </p>
          )}
          <p className="mt-3 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-midnight/55">
            Live technician location sharing is unavailable. This workflow records only manually
            submitted visit updates.
          </p>
          {canUpdateVisit && visitStatusOptions.length > 0 ? (
            <form
              onSubmit={saveVisit}
              className="mt-4 grid gap-4 border-t border-midnight/8 pt-4 sm:grid-cols-2"
            >
              <label
                htmlFor="admin-visit-status"
                className="grid gap-2 text-xs font-semibold text-midnight/75"
              >
                Visit status
                <select
                  id="admin-visit-status"
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
                  htmlFor="admin-visit-eta"
                  className="grid gap-2 text-xs font-semibold text-midnight/75"
                >
                  ETA · optional, your local time ({localTimezone})
                  <input
                    id="admin-visit-eta"
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
              <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-midnight/50">
                  An ETA is a manual estimate, not live tracking or an availability guarantee.
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
          ) : canUpdateVisit ? (
            <p className="mt-4 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-midnight/55">
              This visit is {currentVisitStatus}. Further status changes are not allowed.
            </p>
          ) : !booking.visit ? (
            <p className="mt-4 rounded-xl bg-[#f8faf7] p-3 text-xs leading-5 text-midnight/55">
              Visit updates are available after the assigned technician accepts the booking.
            </p>
          ) : null}
        </DashboardCard>

        {canAssign ? (
          <DashboardCard
            title={booking.assigned_technician_user_id ? 'Reassign booking' : 'Assign a technician'}
            description="Only active, approved technicians with the relevant service skill and coverage are eligible. Assignment is admin-controlled; no time availability is implied."
            icon={UserRound}
          >
            {eligibleLoading ? (
              <LoadingNotice label="Checking current assignment eligibility…" />
            ) : eligibleError ? (
              <Notice kind="error">{eligibleError}</Notice>
            ) : eligibleTechnicians.length === 0 ? (
              <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm leading-6 text-midnight/60">
                No eligible technicians currently meet the active, approved, service-skill and
                coverage rules. No assignment has been made.
              </p>
            ) : (
              <form onSubmit={assign} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2 sm:col-span-2">
                  <label
                    htmlFor="eligible-technician"
                    className="text-sm font-semibold text-midnight"
                  >
                    Eligible technician
                  </label>
                  <select
                    id="eligible-technician"
                    required
                    value={selectedTechnician}
                    onChange={(event) => {
                      assignKey.current = null;
                      setSelectedTechnician(event.currentTarget.value);
                    }}
                    className="min-h-12 w-full min-w-0 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  >
                    <option value="">Choose a currently eligible technician</option>
                    {eligibleTechnicians.map((technician) => (
                      <option
                        key={technician.user_id}
                        value={technician.user_id}
                        disabled={technician.user_id === booking.assigned_technician_user_id}
                      >
                        {technician.display_name} · {technician.coverage_area}
                        {technician.years_experience !== null
                          ? ` · ${technician.years_experience} year(s) experience`
                          : ''}
                        {technician.user_id === booking.assigned_technician_user_id
                          ? ' · currently assigned'
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid min-w-0 gap-2 sm:col-span-2">
                  <label htmlFor="assignment-note" className="text-sm font-semibold text-midnight">
                    Admin assignment note · optional
                  </label>
                  <textarea
                    id="assignment-note"
                    value={assignmentNote}
                    maxLength={500}
                    onChange={(event) => {
                      assignKey.current = null;
                      setAssignmentNote(event.currentTarget.value);
                    }}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || eligibleLoading || !selectedTechnician}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-end"
                >
                  {busy
                    ? 'Saving assignment…'
                    : booking.assigned_technician_user_id
                      ? 'Assign selected technician'
                      : 'Assign technician'}
                </button>
              </form>
            )}
          </DashboardCard>
        ) : null}

        <DashboardCard
          title="PriceLock quote oversight"
          description="All immutable versions are shown. Review who created and decided each version, its itemization, expiry, and customer decision note."
          icon={ShieldCheck}
        >
          {booking.quotes.length ? (
            <div className="grid gap-4">
              {booking.quotes.map((quote) => (
                <div key={quote.id} className="grid gap-2">
                  <PriceLockQuoteCard quote={quote} />
                  <p className="break-all text-xs leading-5 text-midnight/55">
                    Prepared / revised by user {quote.created_by_user_id}
                    {quote.decision_by_user_id
                      ? ` · Decision recorded by user ${quote.decision_by_user_id}`
                      : ' · No decision recorded'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm leading-6 text-midnight/60">
              No quotation has been issued. No price is fabricated or inferred.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-midnight/50">
            Quote oversight is read-only here. The API stores quote totals and decisions; this
            interface does not process payments or refunds.
          </p>
        </DashboardCard>

        <DashboardCard
          title={
            booking.escalation_status === 'escalated'
              ? 'Resolve escalation'
              : 'Open or reopen escalation'
          }
          description="Admin changes are internal audit events. A resolved escalation can be reopened with a new reason."
          icon={ShieldCheck}
        >
          <form onSubmit={updateEscalation} className="grid gap-3">
            <label
              htmlFor="escalation-reason"
              className="grid gap-2 text-sm font-semibold text-midnight"
            >
              {escalationAction === 'resolved' ? 'Resolution note' : 'Escalation reason'}
              <textarea
                id="escalation-reason"
                required
                minLength={5}
                maxLength={1000}
                value={escalationReason}
                onChange={(event) => {
                  escalationKey.current = null;
                  setEscalationReason(event.currentTarget.value);
                }}
                rows={3}
                className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm font-normal leading-6 text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className={`inline-flex min-h-11 w-fit items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${escalationAction === 'resolved' ? 'bg-midnight text-white' : 'border border-midnight/15 bg-white text-midnight hover:bg-[#f4f6f8]'}`}
            >
              {busy
                ? 'Saving…'
                : escalationAction === 'resolved'
                  ? 'Resolve escalation'
                  : booking.escalation_status === 'resolved'
                    ? 'Reopen escalation'
                    : 'Escalate booking'}
            </button>
          </form>
        </DashboardCard>

        {canCancel ? (
          <DashboardCard
            title="Admin cancellation"
            description="Record a reason when operationally necessary. This action is audited and closes the booking."
            icon={RefreshCw}
          >
            <form onSubmit={cancel} className="grid gap-3">
              <label
                htmlFor="admin-cancel-reason"
                className="grid gap-2 text-sm font-semibold text-midnight"
              >
                Cancellation reason
                <textarea
                  id="admin-cancel-reason"
                  required
                  minLength={5}
                  maxLength={1000}
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
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl border border-[#d99b93] px-4 text-sm font-semibold text-[#8d3028] hover:bg-[#fff3f1] disabled:opacity-50"
              >
                {busy ? 'Cancelling…' : 'Cancel booking'}
              </button>
            </form>
          </DashboardCard>
        ) : null}

        <DashboardCard
          title="Ordered audit history"
          description="The sequence is assigned by the booking record and includes sensitive administrative events for authorized admins."
          icon={CalendarDays}
        >
          <BookingTimeline events={booking.events} showActors />
        </DashboardCard>
      </div>
    </AdminBookingFrame>
  );
}
