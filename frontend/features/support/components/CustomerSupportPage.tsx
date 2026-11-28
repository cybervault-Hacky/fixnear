'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronRight, LifeBuoy, LoaderCircle, Plus, RefreshCw, Send, X } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { FixNearApiError } from '@/lib/api/client';
import { Notice, LoadingNotice } from '@/features/bookings/components/booking-ui';
import {
  addCustomerMessage,
  createTicket,
  getMyTicket,
  listMyTickets,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '@/lib/api/support';
import type {
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketSummary,
} from '@/lib/api/support';

const CATEGORIES = Object.keys(ticketCategoryLabels) as SupportTicketCategory[];

const statusStyles: Record<string, string> = {
  open: 'bg-[#fff4d8] text-[#72510b]',
  assigned: 'bg-[#e9f2ff] text-[#224b7a]',
  in_progress: 'bg-[#e9f2ff] text-[#224b7a]',
  waiting_for_customer: 'bg-[#f3ecfb] text-[#5b3a8e]',
  resolved: 'bg-[#eef7e5] text-midnight',
  closed: 'bg-[#f1f3f5] text-midnight/60',
};

export function CustomerSupportPage() {
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<SupportTicketCategory>('booking_issue');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    listMyTickets()
      .then((result) => setTickets(result.items))
      .catch((error: unknown) => {
        if (error instanceof FixNearApiError && (error.status === 401 || error.status === 403)) {
          setForbidden(true);
          setLoadError('Sign in with your FixNear account to use support.');
          return;
        }
        setLoadError(
          error instanceof FixNearApiError ? error.message : 'Support tickets could not be loaded.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = useCallback((ticketId: string) => {
    setSelectedId(ticketId);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    getMyTicket(ticketId)
      .then((result) => setDetail(result))
      .catch((error: unknown) =>
        setDetailError(
          error instanceof FixNearApiError ? error.message : 'The ticket could not be loaded.',
        ),
      )
      .finally(() => setDetailLoading(false));
  }, []);

  const submitTicket = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 10) {
      setFormError('Describe the issue in at least 10 characters so support can act on it.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    setFormMessage('');
    createTicket({
      category,
      subject: subject.trim() || null,
      description: trimmedDescription,
    })
      .then((created) => {
        setFormMessage('Your ticket was created. We will get back to you here.');
        setSubject('');
        setDescription('');
        setShowForm(false);
        load();
        openTicket(created.id);
      })
      .catch((error: unknown) =>
        setFormError(
          error instanceof FixNearApiError ? error.message : 'The ticket could not be created.',
        ),
      )
      .finally(() => setSubmitting(false));
  };

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = reply.trim();
    if (!selectedId || body.length < 2) return;
    setReplyBusy(true);
    setDetailError('');
    addCustomerMessage(selectedId, body)
      .then((updated) => {
        setDetail(updated);
        setReply('');
      })
      .catch((error: unknown) =>
        setDetailError(
          error instanceof FixNearApiError ? error.message : 'The reply could not be sent.',
        ),
      )
      .finally(() => setReplyBusy(false));
  };

  return (
    <>
      <DashboardPageHeader
        eyebrow="Support"
        title="Help & support"
        description="Raise a ticket about a booking, warranty, payment or account issue. Track replies from the FixNear support team in one place."
        action={
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-midnight"
          >
            {showForm ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {showForm ? 'Close form' : 'New ticket'}
          </button>
        }
      />

      {showForm ? (
        <DashboardCard
          title="Describe the issue"
          description="Category and details help us route your ticket. Emails, card details and passwords are never required here."
          icon={LifeBuoy}
          className="mb-5"
        >
          <form onSubmit={submitTicket} className="grid gap-3">
            {formError ? <Notice kind="error">{formError}</Notice> : null}
            {formMessage ? <Notice kind="success">{formMessage}</Notice> : null}
            <label>
              <span className="text-xs font-semibold text-midnight">Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
                className="mt-1 min-h-11 w-full rounded-xl border border-midnight/15 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {ticketCategoryLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-semibold text-midnight">Subject (optional)</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={140}
                placeholder="Short summary — e.g. Technician did not show up"
                className="mt-1 min-h-11 w-full rounded-xl border border-midnight/15 px-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
              />
            </label>
            <label>
              <span className="text-xs font-semibold text-midnight">What happened?</span>
              <textarea
                required
                minLength={10}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Include dates, booking references and what you expected…"
                className="mt-1 w-full rounded-xl border border-midnight/15 p-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : null}
                Submit ticket
              </button>
            </div>
          </form>
        </DashboardCard>
      ) : null}

      {forbidden ? <Notice kind="error">{loadError}</Notice> : null}
      {loadError && !forbidden ? <Notice kind="error">{loadError}</Notice> : null}
      {loading ? <LoadingNotice label="Loading your tickets…" /> : null}

      {!loading && !forbidden ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <DashboardCard
            title="Your tickets"
            description="Every ticket is linked to your account and visible only to you and support staff."
            icon={LifeBuoy}
            action={
              <button
                type="button"
                onClick={load}
                aria-label="Refresh tickets"
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-midnight/15"
              >
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            }
          >
            {tickets.length === 0 ? (
              <p className="text-sm text-midnight/55">
                You have no support tickets yet. If something went wrong with a booking, warranty or
                payment, open one — we track it to resolution.
              </p>
            ) : (
              <ul className="divide-y divide-midnight/8 overflow-hidden rounded-2xl border border-midnight/10">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => openTicket(ticket.id)}
                      aria-current={selectedId === ticket.id}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[#f4f6f8] ${selectedId === ticket.id ? 'bg-[#eef2ec]' : 'bg-white'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-midnight">
                          {ticket.subject}
                        </span>
                        <span className="block text-[0.7rem] text-midnight/55">
                          {ticketCategoryLabels[ticket.category]} ·{' '}
                          {new Date(ticket.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[0.65rem] font-semibold uppercase tracking-wide ${statusStyles[ticket.status]}`}
                        >
                          {ticketStatusLabels[ticket.status]}
                        </span>
                        <ChevronRight size={14} aria-hidden="true" className="text-midnight/40" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Conversation"
            description="Replies from support appear here."
            icon={Send}
          >
            {!selectedId ? (
              <p className="text-sm text-midnight/55">Select a ticket to read the conversation.</p>
            ) : null}
            {selectedId && detailLoading ? <LoadingNotice label="Loading conversation…" /> : null}
            {selectedId && detailError ? <Notice kind="error">{detailError}</Notice> : null}
            {detail ? (
              <div className="grid gap-3">
                <p className="text-[0.7rem] uppercase tracking-wide text-midnight/45">
                  Status: {ticketStatusLabels[detail.status]}
                </p>
                <ol className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-midnight/10 bg-white p-2">
                  <li className="max-w-[90%] rounded-xl bg-[#eef2ec] px-3 py-2 text-xs leading-5 text-midnight">
                    <span className="block text-[0.6rem] font-semibold uppercase tracking-wide opacity-60">
                      Your request
                    </span>
                    {detail.description}
                  </li>
                  {detail.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-5 ${message.author_kind === 'customer' ? 'ml-auto bg-midnight text-white' : 'bg-[#e9f2ff] text-midnight'}`}
                    >
                      <span className="block text-[0.6rem] font-semibold uppercase tracking-wide opacity-70">
                        {message.author_kind === 'customer' ? 'You' : 'FixNear support'} ·{' '}
                        {new Date(message.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                      {message.body}
                    </li>
                  ))}
                </ol>
                {detail.status !== 'closed' ? (
                  <form onSubmit={submitReply} className="flex gap-2">
                    <label className="min-w-0 grow">
                      <span className="sr-only">Add a reply</span>
                      <input
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Add a reply…"
                        className="min-h-11 w-full rounded-xl border border-midnight/15 px-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={replyBusy || reply.trim().length < 2}
                      aria-label="Send reply"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-midnight text-white disabled:opacity-40"
                    >
                      {replyBusy ? (
                        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Send size={16} aria-hidden="true" />
                      )}
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-midnight/55">
                    This ticket is closed. Open a new ticket if you need more help.
                  </p>
                )}
              </div>
            ) : null}
          </DashboardCard>
        </div>
      ) : null}
    </>
  );
}
