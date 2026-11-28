'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, jsonRequest } from '@/lib/api/client';

type Job = {
  id: string;
  category: string;
  event_reference: string;
  recipient_reference: string;
  channel: string;
  simulated: boolean;
  state: string;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  failure_reason: string | null;
};
type Attempt = {
  number: number;
  outcome: string;
  started_at: string;
  finished_at: string | null;
  failure_reason: string | null;
};
type Page = { items: Job[]; total: number; offset: number; limit: number };
type Detail = Job & { attempts: Attempt[] };
export default function DeliveryPage() {
  const [page, setPage] = useState<Page | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [state, setState] = useState('');
  const [channel, setChannel] = useState('');
  const [category, setCategory] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ limit: '25', offset: String(offset) });
      if (state) q.set('state', state);
      if (channel) q.set('channel', channel);
      if (category) q.set('category', category);
      setPage(await apiRequest<Page>(`admin/notification-deliveries?${q}`));
    } catch {
      setError('Unable to load delivery records.');
    } finally {
      setLoading(false);
    }
  }, [offset, state, channel, category]);
  useEffect(() => {
    void load();
  }, [load]);
  const show = async (id: string) => {
    setError('');
    try {
      setDetail(await apiRequest<Detail>(`admin/notification-deliveries/${id}`));
    } catch {
      setError('Unable to load delivery details.');
    }
  };
  const retry = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`admin/notification-deliveries/${id}/retry`, jsonRequest('POST', {}));
      await load();
      await show(id);
    } catch {
      setError('Retry was not confirmed.');
    } finally {
      setBusy(false);
    }
  };
  const select = (label: string, value: string, change: (v: string) => void, values: string[]) => (
    <label className="text-sm">
      {label}{' '}
      <select
        className="rounded border p-2"
        value={value}
        onChange={(e) => {
          change(e.target.value);
          setOffset(0);
        }}
      >
        <option value="">All</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Notification delivery monitoring</h1>
      <p className="text-sm">
        External channels are simulations only. In-app notifications appear independently of queue
        processing.
      </p>
      <div className="flex flex-wrap gap-3">
        {select('State', state, setState, [
          'pending',
          'processing',
          'delivered',
          'retry_pending',
          'permanently_failed',
        ])}
        {select('Channel', channel, setChannel, [
          'in_app',
          'email',
          'sms',
          'web_push',
          'mobile_push',
        ])}
        {select('Category', category, setCategory, [
          'booking',
          'quote',
          'warranty',
          'maintenance',
          'support',
          'security',
        ])}
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading deliveries…</p>}
      {page && !loading && page.items.length === 0 && <p>No delivery records found.</p>}
      <ul className="grid gap-3">
        {page?.items.map((job) => (
          <li key={job.id} className="rounded-xl border bg-white p-4 text-sm">
            <p>
              <strong>{job.category}</strong> · {job.channel} {job.simulated ? '(simulated)' : ''} ·{' '}
              {job.state}
            </p>
            <p>Recipient reference: {job.recipient_reference}</p>
            <p>Event: {job.event_reference}</p>
            <p>
              Attempts: {job.attempt_count} / {job.max_attempts}
            </p>
            <p>Created: {new Date(job.created_at).toLocaleString()}</p>
            <p>
              Last attempt:{' '}
              {job.last_attempt_at ? new Date(job.last_attempt_at).toLocaleString() : '—'} · Next
              retry: {job.next_attempt_at ? new Date(job.next_attempt_at).toLocaleString() : '—'}
            </p>
            <p>Failure: {job.failure_reason ?? '—'}</p>
            <button
              className="mt-2 min-h-11 rounded border px-3"
              type="button"
              onClick={() => void show(job.id)}
            >
              Details
            </button>{' '}
            {job.state === 'permanently_failed' && (
              <button
                className="min-h-11 rounded border px-3"
                type="button"
                disabled={busy}
                onClick={() => void retry(job.id)}
              >
                Retry (audited)
              </button>
            )}
          </li>
        ))}
      </ul>
      {page && (
        <div className="flex gap-3">
          <button
            className="min-h-11 rounded border px-3"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous
          </button>
          <span>{page.total} results</span>
          <button
            className="min-h-11 rounded border px-3"
            disabled={offset + page.limit >= page.total}
            onClick={() => setOffset(offset + 25)}
          >
            Next
          </button>
        </div>
      )}
      {detail && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">Attempt history</h2>
          <p className="break-all text-xs">Delivery {detail.id}</p>
          {detail.attempts.length === 0 ? (
            <p>No attempts yet.</p>
          ) : (
            <ul>
              {detail.attempts.map((a) => (
                <li key={a.number} className="text-sm">
                  #{a.number}: {a.outcome} · {new Date(a.started_at).toLocaleString()}{' '}
                  {a.failure_reason ? `· ${a.failure_reason}` : ''}
                </li>
              ))}
            </ul>
          )}
          <button className="mt-2 min-h-11 rounded border px-3" onClick={() => setDetail(null)}>
            Close details
          </button>
        </section>
      )}
    </section>
  );
}
