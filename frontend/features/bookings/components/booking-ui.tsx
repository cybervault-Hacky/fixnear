import type {
  BookingEvent,
  BookingQuote,
  BookingStatus,
  BookingVisitStatus,
} from '@/lib/api/bookings';

export const bookingStatusLabels: Record<BookingStatus, string> = {
  requested: 'Request received',
  assigned: 'Technician assigned',
  accepted: 'Technician accepted',
  inspection_pending: 'Inspection in progress',
  quote_pending: 'Quote needs your decision',
  quote_rejected: 'Quote declined',
  approved: 'Quote approved',
  in_progress: 'Repair in progress',
  completed: 'Service completed',
  cancelled: 'Request cancelled',
};

export function formatPaise(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function formatBookingDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

export function formatWindow(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export function formatDateTime(value: string, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export function messageForBookingError(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    const message = 'message' in error ? String((error as { message: unknown }).message) : '';
    if (status === 401) return 'Sign in with an active FixNear account to continue.';
    if (status === 403) return 'This action requires the appropriate server-managed FixNear role.';
    if (status === 404) return 'This record is not available to the signed-in account.';
    if (status === 409) return message || 'The booking changed. Refresh the page and try again.';
    if (status === 503)
      return message || 'The FixNear booking API is not configured or is unavailable.';
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'The FixNear booking API could not be reached. Please retry.';
}

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const isFinal = status === 'completed' || status === 'cancelled';
  const tone = isFinal
    ? 'bg-[#f1f3f5] text-midnight/65'
    : status === 'quote_pending'
      ? 'bg-[#fff4d8] text-[#72510b]'
      : status === 'in_progress'
        ? 'bg-[#e9f2ff] text-[#224b7a]'
        : 'bg-[#eef7e5] text-midnight';
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-semibold ${tone}`}
    >
      {bookingStatusLabels[status]}
    </span>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const styles = {
    error: 'border-[#e9b8b2] bg-[#fff3f1] text-[#8d3028]',
    success: 'border-[#cbe7ae] bg-[#eef7e5] text-midnight',
    info: 'border-midnight/10 bg-[#f8faf7] text-midnight/65',
  } as const;
  return (
    <p
      role={kind === 'error' ? 'alert' : kind === 'success' ? 'status' : undefined}
      aria-live={kind === 'error' ? undefined : 'polite'}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${styles[kind]}`}
    >
      {children}
    </p>
  );
}

export function LoadingNotice({ label = 'Loading booking information…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65"
    >
      {label}
    </div>
  );
}

const eventLabels: Record<string, string> = {
  'booking.created': 'Request submitted',
  'booking.status_changed': 'Status updated',
  'booking.assignment.assigned': 'Technician assigned',
  'booking.assignment.reassigned': 'Technician reassigned',
  'booking.assignment.accepted': 'Technician accepted the work',
  'booking.assignment.declined': 'Technician declined the assignment',
  'booking.assignment.removed': 'Technician assignment removed',
  'booking.inspection.started': 'Inspection started',
  'booking.work.started': 'Repair work started after quote approval',
  'booking.completed': 'Service marked complete',
  'booking.cancelled': 'Request cancelled',
  'booking.visit.updated': 'Manual visit status updated',
  'booking.escalation.escalated': 'Admin escalation opened',
  'booking.escalation.resolved': 'Admin escalation resolved',
  'booking.escalation.reopened': 'Admin escalation reopened',
  'quote.created': 'PriceLock quote issued',
  'quote.revised': 'PriceLock quote revised',
  'quote.approved': 'Customer approved the quote',
  'quote.rejected': 'Customer declined the quote',
  'booking.attachment.upload_intent_created': 'Attachment upload prepared',
};

const visitStatusLabels: Record<BookingVisitStatus, string> = {
  scheduled: 'scheduled',
  en_route: 'en route',
  arrived: 'arrived',
  completed: 'completed',
  cancelled: 'cancelled',
};

function statusLabelForEvent(eventType: string, status: string): string {
  if (eventType === 'booking.visit.updated') {
    return visitStatusLabels[status as BookingVisitStatus] ?? status.replaceAll('_', ' ');
  }
  return bookingStatusLabels[status as BookingStatus] ?? status.replaceAll('_', ' ');
}

export function BookingTimeline({
  events,
  showActors = false,
}: {
  events: BookingEvent[];
  showActors?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm leading-6 text-midnight/55">
        No booking events have been recorded yet.
      </p>
    );
  }
  return (
    <ol className="grid gap-3">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-lime" />
          <div className="min-w-0 flex-1 border-b border-midnight/8 pb-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-midnight">
                {eventLabels[event.event_type] ?? event.event_type.replaceAll('.', ' ')}
              </p>
              <span className="text-[0.65rem] tabular-nums text-midnight/40">
                #{event.sequence}
              </span>
              {showActors && event.is_internal ? (
                <span className="rounded-full bg-[#f1f3f5] px-2 py-0.5 text-[0.6rem] font-semibold text-midnight/55">
                  Admin only
                </span>
              ) : null}
            </div>
            {event.from_status && event.to_status ? (
              <p className="mt-1 text-xs text-midnight/55">
                {statusLabelForEvent(event.event_type, event.from_status)}
                {' → '}
                {statusLabelForEvent(event.event_type, event.to_status)}
              </p>
            ) : null}
            {event.note ? (
              <p className="mt-1 text-xs leading-5 text-midnight/60">{event.note}</p>
            ) : null}
            {showActors && (event.actor_user_id || event.target_user_id) ? (
              <p className="mt-1 break-all text-[0.65rem] leading-5 text-midnight/45">
                {event.actor_user_id ? `Actor ${event.actor_user_id}` : 'System'}
                {event.target_user_id ? ` · Target ${event.target_user_id}` : ''}
              </p>
            ) : null}
            <time
              className="mt-1 block text-[0.68rem] text-midnight/45"
              dateTime={event.created_at}
            >
              {formatDateTime(event.created_at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PriceLockQuoteCard({
  quote,
  actions,
}: {
  quote: BookingQuote;
  actions?: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-midnight">
            PriceLock quote · version {quote.version}
          </p>
          <p className="mt-1 text-xs text-midnight/55">
            Issued {formatDateTime(quote.issued_at)} · Expires {formatDateTime(quote.expires_at)}
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#f1f3f5] px-3 py-1 text-xs font-semibold capitalize text-midnight/65">
          {quote.is_expired ? 'Expired' : quote.status}
        </span>
      </div>
      {quote.technician_notes ? (
        <p className="mt-4 rounded-xl bg-[#f8faf7] p-3 text-sm leading-6 text-midnight/70">
          <span className="font-semibold text-midnight">Technician notes: </span>
          {quote.technician_notes}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {quote.line_items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-lg border-b border-midnight/8 py-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-midnight">{item.description}</p>
              <p className="mt-0.5 text-xs capitalize text-midnight/55">
                {item.line_type.replaceAll('_', ' ')} · {item.quantity} ×{' '}
                {formatPaise(item.unit_amount_paise, quote.currency)}
              </p>
            </div>
            <p className="self-center text-right text-sm tabular-nums text-midnight/75">
              {formatPaise(item.line_total_paise, quote.currency)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-midnight/12 pt-3">
        <p className="text-sm font-semibold text-midnight">Total · {quote.currency}</p>
        <p className="text-lg font-semibold tabular-nums text-midnight">
          {formatPaise(quote.total_paise, quote.currency)}
        </p>
      </div>
      {quote.decision_note ? (
        <p className="mt-3 text-xs leading-5 text-midnight/60">
          Customer note: {quote.decision_note}
        </p>
      ) : null}
      {actions ? <div className="mt-4 border-t border-midnight/8 pt-4">{actions}</div> : null}
    </article>
  );
}
