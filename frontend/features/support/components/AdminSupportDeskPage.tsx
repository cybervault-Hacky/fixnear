'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Lock,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserPlus,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminErrorState, AdminLoadingState } from '@/features/admin/components/AdminShell';
import {
  adminErrorMessage,
  formatDateTime,
  isForbidden,
} from '@/features/admin/components/admin-errors';
import {
  addInternalNote,
  addStaffMessage,
  assignTicket,
  escalateTicket,
  getAdminTicket,
  listAdminTickets,
  listAssignees,
  setTicketStatus,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '@/lib/api/support';
import type {
  AdminTicketDetail,
  AdminTicketListItem,
  SupportTicketStatus,
  TicketAssignee,
} from '@/lib/api/support';

const PAGE_SIZE = 15;

type Queue = 'open' | 'waiting_for_customer' | 'escalated' | 'resolved' | 'closed';

const QUEUE_TABS: { value: Queue; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'waiting_for_customer', label: 'Waiting for customer' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_OPTIONS: SupportTicketStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'waiting_for_customer',
  'resolved',
  'closed',
];

const priorityStyles: Record<string, string> = {
  normal: 'bg-[#f1f3f5] text-midnight/60',
  high: 'bg-[#fff4d8] text-[#72510b]',
  urgent: 'bg-[#fff3f1] text-[#8d3028]',
};

export function AdminSupportDeskPage() {
  const [queue, setQueue] = useState<Queue>('open');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<AdminTicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [assignees, setAssignees] = useState<TicketAssignee[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [staffMessage, setStaffMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [showEscalate, setShowEscalate] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const conversationRef = useRef<HTMLOListElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params =
      queue === 'escalated'
        ? { escalated: true, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
        : { status: queue as SupportTicketStatus, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    listAdminTickets(appliedSearch ? { ...params, search: appliedSearch } : params)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((requestError: unknown) => {
        setForbidden(isForbidden(requestError));
        setError(adminErrorMessage(requestError, 'The support queue could not be loaded.'));
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [queue, appliedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listAssignees()
      .then((result) => setAssignees(result.items))
      .catch(() => setAssignees([]));
  }, []);

  const openTicket = useCallback((ticketId: string) => {
    setSelectedId(ticketId);
    setDetail(null);
    setDetailError('');
    setActionError('');
    setActionMessage('');
    setShowEscalate(false);
    setAssignTo('');
    setDetailLoading(true);
    getAdminTicket(ticketId)
      .then((result) => setDetail(result))
      .catch((requestError: unknown) => setDetailError(adminErrorMessage(requestError)))
      .finally(() => setDetailLoading(false));
  }, []);

  const refreshDetail = useCallback(() => {
    if (!selectedId) return;
    getAdminTicket(selectedId)
      .then((result) => setDetail(result))
      .catch(() => undefined);
    load();
  }, [selectedId, load]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setAppliedSearch(search.trim());
  };

  const runAction = (action: () => Promise<unknown>, success: string) => {
    setActionBusy(true);
    setActionError('');
    setActionMessage('');
    action()
      .then(() => {
        setActionMessage(success);
        refreshDetail();
      })
      .catch((requestError: unknown) => setActionError(adminErrorMessage(requestError)))
      .finally(() => setActionBusy(false));
  };

  const submitStaffMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || staffMessage.trim().length < 2) return;
    const body = staffMessage.trim();
    setStaffMessage('');
    runAction(
      () => addStaffMessage(selectedId, body).then((result) => setDetail(result)),
      'Reply sent to the customer.',
    );
  };

  const submitInternalNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || internalNote.trim().length < 2) return;
    const body = internalNote.trim();
    setInternalNote('');
    runAction(
      () => addInternalNote(selectedId, body),
      'Internal note saved. Never visible to the customer.',
    );
  };

  const submitEscalate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId) return;
    const reason = escalateReason.trim();
    if (reason.length < 10) {
      setActionError('Escalation needs a reason of at least 10 characters.');
      return;
    }
    setEscalateReason('');
    setShowEscalate(false);
    runAction(
      () => escalateTicket(selectedId, reason).then((result) => setDetail(result)),
      'Ticket escalated and admins notified in the queue.',
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight });
  }, [detail?.messages.length]);

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin"
        title="Support desk"
        description="Triage customer support tickets: assign to staff, reply in-thread, keep internal notes private, and resolve with an audited status trail."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <DashboardCard
          title="Queue"
          description="Database-backed tickets, newest first."
          icon={LifeBuoy}
        >
          <div role="tablist" aria-label="Ticket queues" className="flex flex-wrap gap-2">
            {QUEUE_TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={queue === tab.value}
                onClick={() => {
                  setQueue(tab.value);
                  setPage(0);
                }}
                className={`inline-flex min-h-9 items-center rounded-xl border px-3 text-xs font-semibold ${
                  queue === tab.value
                    ? 'border-midnight bg-midnight text-white'
                    : 'border-midnight/15 bg-white text-midnight/75 hover:text-midnight'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <form onSubmit={applySearch} className="mt-3 flex gap-2">
            <label className="relative min-w-0 grow">
              <span className="sr-only">Search tickets</span>
              <Search
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-midnight/40"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject or description…"
                className="min-h-10 w-full rounded-xl border border-midnight/15 bg-white pl-9 pr-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 bg-white px-3 text-xs font-semibold text-midnight"
            >
              Search
            </button>
            <button
              type="button"
              onClick={load}
              aria-label="Refresh queue"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-midnight/15 bg-white text-midnight"
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </form>

          {loading ? <AdminLoadingState label="Loading tickets…" /> : null}
          {error && forbidden ? <AdminErrorState message={error} /> : null}
          {error && !forbidden ? <AdminErrorState message={error} onRetry={load} /> : null}

          {!loading && !error ? (
            items.length === 0 ? (
              <p className="mt-4 text-sm text-midnight/55">No tickets in this queue.</p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-midnight/8 overflow-hidden rounded-2xl border border-midnight/10">
                  {items.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => openTicket(ticket.id)}
                        aria-current={selectedId === ticket.id}
                        className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-[#f4f6f8] ${
                          selectedId === ticket.id ? 'bg-[#eef2ec]' : 'bg-white'
                        }`}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-midnight">
                            {ticket.subject}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {ticket.escalation_status === 'escalated' ? (
                              <AlertTriangle
                                size={14}
                                aria-hidden="true"
                                className="text-[#8d3028]"
                              />
                            ) : null}
                            <span
                              className={`inline-flex min-h-6 items-center rounded-full px-2 text-[0.6rem] font-semibold uppercase tracking-wide ${priorityStyles[ticket.priority]}`}
                            >
                              {ticket.priority}
                            </span>
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-midnight/55">
                          <span>
                            {ticketCategoryLabels[ticket.category]} ·{' '}
                            {ticket.customer_display_name ?? 'Customer'}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatDateTime(ticket.created_at)}
                          </span>
                        </span>
                        <span className="text-[0.65rem] uppercase tracking-wide text-midnight/40">
                          {ticketStatusLabels[ticket.status]}
                          {ticket.assigned_to_name
                            ? ` · assigned to ${ticket.assigned_to_name}`
                            : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {total > PAGE_SIZE ? (
                  <div className="mt-3 flex items-center justify-between text-xs text-midnight/60">
                    <span className="tabular-nums">
                      {total} total · page {page + 1} of {totalPages}
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        aria-label="Previous page"
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-midnight/15 disabled:opacity-40"
                      >
                        <ChevronLeft size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                        disabled={page + 1 >= totalPages}
                        aria-label="Next page"
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-midnight/15 disabled:opacity-40"
                      >
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                ) : null}
              </>
            )
          ) : null}
        </DashboardCard>

        <DashboardCard
          title="Ticket detail"
          description="Staff thread and internal notes stay separate; customers never see internal notes."
          icon={MessageSquare}
        >
          {!selectedId ? (
            <p className="text-sm text-midnight/55">Select a ticket to open it.</p>
          ) : null}
          {selectedId && detailLoading ? <AdminLoadingState label="Loading ticket…" /> : null}
          {detailError && selectedId ? (
            <AdminErrorState message={detailError} onRetry={() => openTicket(selectedId)} />
          ) : null}
          {actionMessage ? (
            <p
              role="status"
              className="mb-2 rounded-xl border border-[#cbe7ae] bg-[#eef7e5] px-3 py-2 text-xs font-semibold text-midnight"
            >
              {actionMessage}
            </p>
          ) : null}
          {actionError ? (
            <p
              role="alert"
              className="mb-2 rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-3 py-2 text-xs font-semibold text-[#8d3028]"
            >
              {actionError}
            </p>
          ) : null}

          {detail ? (
            <div className="grid gap-4">
              <div className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-midnight">{detail.subject}</p>
                  <span
                    className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[0.65rem] font-semibold uppercase tracking-wide ${priorityStyles[detail.priority]}`}
                  >
                    {detail.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-midnight/60">
                  {ticketCategoryLabels[detail.category]} · opened{' '}
                  {formatDateTime(detail.created_at)} · customer{' '}
                  {detail.customer_display_name ?? detail.customer_user_id.slice(0, 8)}
                </p>
                <p className="mt-2 text-sm leading-6 text-midnight/85">{detail.description}</p>
                <p className="mt-2 text-[0.65rem] uppercase tracking-wide text-midnight/45">
                  Status: {ticketStatusLabels[detail.status]}
                  {detail.escalation_status === 'escalated' ? ' · escalated' : ''}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedId || !assignTo) return;
                    runAction(
                      () => assignTicket(selectedId, assignTo).then((result) => setDetail(result)),
                      'Ticket assigned.',
                    );
                  }}
                  className="flex items-end gap-2"
                >
                  <label className="min-w-0 grow">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/50">
                      Assign to
                    </span>
                    <select
                      value={assignTo}
                      onChange={(event) => setAssignTo(event.target.value)}
                      className="mt-1 min-h-10 w-full rounded-xl border border-midnight/15 bg-white px-2 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      <option value="">Select admin…</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.user_id} value={assignee.user_id}>
                          {assignee.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={actionBusy || !assignTo}
                    aria-label="Assign ticket"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-midnight text-white disabled:opacity-40"
                  >
                    <UserPlus size={15} aria-hidden="true" />
                  </button>
                </form>
                <label className="block">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/50">
                    Set status
                  </span>
                  <select
                    value={detail.status}
                    disabled={actionBusy}
                    onChange={(event) =>
                      selectedId &&
                      runAction(
                        () =>
                          setTicketStatus(
                            selectedId,
                            event.target.value as SupportTicketStatus,
                          ).then((result) => setDetail(result)),
                        'Status updated.',
                      )
                    }
                    className="mt-1 min-h-10 w-full rounded-xl border border-midnight/15 bg-white px-2 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {ticketStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                  Customer conversation
                </h3>
                <ol
                  ref={conversationRef}
                  className="mt-1 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-midnight/10 bg-white p-2"
                >
                  {detail.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-5 ${
                        message.author_kind === 'staff'
                          ? 'ml-auto bg-midnight text-white'
                          : 'bg-[#eef2ec] text-midnight'
                      }`}
                    >
                      <span className="block text-[0.6rem] font-semibold uppercase tracking-wide opacity-70">
                        {message.author_kind === 'staff' ? 'Support' : 'Customer'} ·{' '}
                        {formatDateTime(message.created_at)}
                      </span>
                      {message.body}
                    </li>
                  ))}
                  {detail.messages.length === 0 ? (
                    <li className="p-2 text-xs text-midnight/50">No messages yet.</li>
                  ) : null}
                </ol>
                <form onSubmit={submitStaffMessage} className="mt-2 flex gap-2">
                  <label className="min-w-0 grow">
                    <span className="sr-only">Reply to customer</span>
                    <input
                      value={staffMessage}
                      onChange={(event) => setStaffMessage(event.target.value)}
                      placeholder="Reply to the customer…"
                      className="min-h-10 w-full rounded-xl border border-midnight/15 px-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={actionBusy || staffMessage.trim().length < 2}
                    aria-label="Send reply"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-midnight text-white disabled:opacity-40"
                  >
                    {actionBusy ? (
                      <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Send size={15} aria-hidden="true" />
                    )}
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-[#e4d8f5] bg-[#faf7ff] p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#5b3a8e]">
                  <Lock size={13} aria-hidden="true" /> Internal notes (never shown to customer)
                </h3>
                <ul className="mt-2 grid gap-1.5">
                  {detail.internal_notes.map((note) => (
                    <li
                      key={note.id}
                      className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-midnight/85"
                    >
                      <span className="block text-[0.6rem] uppercase tracking-wide text-midnight/40">
                        {formatDateTime(note.created_at)}
                      </span>
                      {note.body}
                    </li>
                  ))}
                  {detail.internal_notes.length === 0 ? (
                    <li className="text-xs text-midnight/50">No internal notes yet.</li>
                  ) : null}
                </ul>
                <form onSubmit={submitInternalNote} className="mt-2 flex gap-2">
                  <label className="min-w-0 grow">
                    <span className="sr-only">Add internal note</span>
                    <input
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                      placeholder="Add an internal note…"
                      className="min-h-9 w-full rounded-xl border border-[#e4d8f5] bg-white px-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={actionBusy || internalNote.trim().length < 2}
                    className="inline-flex min-h-9 items-center rounded-xl border border-[#d9cdf0] bg-white px-3 text-[0.7rem] font-semibold text-[#5b3a8e] disabled:opacity-40"
                  >
                    Note
                  </button>
                </form>
              </div>

              {showEscalate ? (
                <form
                  onSubmit={submitEscalate}
                  className="rounded-xl border border-[#d99b93] bg-[#fff3f1] p-3"
                >
                  <label htmlFor="escalate-reason" className="text-xs font-semibold text-[#8d3028]">
                    Why should this be escalated? (min 10 characters)
                  </label>
                  <textarea
                    id="escalate-reason"
                    required
                    minLength={10}
                    rows={2}
                    value={escalateReason}
                    onChange={(event) => setEscalateReason(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#d99b93] bg-white p-2 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="inline-flex min-h-9 items-center rounded-xl bg-[#8d3028] px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Confirm escalation
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEscalate(false)}
                      className="inline-flex min-h-9 items-center rounded-xl border border-midnight/15 px-4 text-xs font-semibold text-midnight"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEscalate(true)}
                  className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-xl border border-[#d99b93] px-4 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1]"
                >
                  <AlertTriangle size={14} aria-hidden="true" /> Escalate ticket
                </button>
              )}
            </div>
          ) : null}
        </DashboardCard>
      </div>
    </>
  );
}
