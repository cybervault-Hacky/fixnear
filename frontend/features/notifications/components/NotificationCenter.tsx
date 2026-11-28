'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { apiRequest, jsonRequest } from '@/lib/api/client';

type Category = 'booking' | 'quote' | 'warranty' | 'maintenance' | 'support' | 'security';
type Item = {
  id: string;
  category: Category;
  title: string;
  message: string;
  action_path: string;
  state: 'unread' | 'read' | 'archived';
  created_at: string;
};
type Page = { items: Item[]; total: number; unread_count: number; offset: number; limit: number };
type Preferences = Record<Category, boolean>;
const categories: Category[] = [
  'booking',
  'quote',
  'warranty',
  'maintenance',
  'support',
  'security',
];

export function NotificationCenter() {
  const [page, setPage] = useState<Page | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ limit: '25', offset: String(offset) });
      if (category !== 'all') query.set('category', category);
      const [list, preferences] = await Promise.all([
        apiRequest<Page>(`notifications?${query}`),
        apiRequest<Preferences>('notifications/preferences'),
      ]);
      setPage(list);
      setPrefs(preferences);
    } catch {
      setError('Notifications could not be loaded. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [category, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      await load();
    } catch {
      setError('The update could not be confirmed. Please retry.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5" aria-labelledby="notification-title">
      <header>
        <p className="text-xs uppercase tracking-wide text-midnight/60">In-app updates</p>
        <h1 id="notification-title" className="text-2xl font-semibold">
          Notifications
        </h1>
        <p className="text-sm text-midnight/65">
          Only supported booking and quote events are shown. Email, SMS and push are not enabled.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading notifications…</p>}
      {page && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <strong>{page.unread_count} unread</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => apiRequest('notifications/read-all', jsonRequest('POST', {})))
              }
              className="min-h-11 rounded-lg border px-3 disabled:opacity-50"
            >
              Mark all read
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="min-h-11 rounded-lg border px-3"
            >
              Refresh
            </button>
          </div>
          <label className="block text-sm">
            Category{' '}
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as Category | 'all');
                setOffset(0);
              }}
              className="ml-2 rounded-lg border p-2"
            >
              <option value="all">All</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {!loading && page.items.length === 0 && <p>No notifications in this view.</p>}
          <ul className="grid gap-3">
            {page.items.map((item) => (
              <li key={item.id} className="rounded-xl border border-midnight/10 bg-white p-4">
                <p className="text-xs uppercase text-midnight/55">
                  {item.category} · {item.state}
                </p>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="text-sm">{item.message}</p>
                <p className="text-xs text-midnight/55">
                  {new Date(item.created_at).toLocaleString()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {/^\/(?:bookings|technician\/bookings)\/[0-9a-f-]{36}$/i.test(
                    item.action_path,
                  ) && (
                    <Link
                      className="min-h-10 rounded-lg border px-3 py-2 text-sm"
                      href={item.action_path}
                    >
                      View booking
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        apiRequest(
                          `notifications/${item.id}`,
                          jsonRequest('PATCH', {
                            state: item.state === 'unread' ? 'read' : 'unread',
                          }),
                        ),
                      )
                    }
                    className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50"
                  >
                    {item.state === 'unread' ? 'Mark read' : 'Mark unread'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || item.state === 'archived'}
                    onClick={() =>
                      void run(() =>
                        apiRequest(
                          `notifications/${item.id}`,
                          jsonRequest('PATCH', { state: 'archived' }),
                        ),
                      )
                    }
                    className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 25))}
              className="min-h-11 rounded-lg border px-3 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              {' '}
              {page.total
                ? `${offset + 1}–${Math.min(offset + page.limit, page.total)} of ${page.total}`
                : '0 results'}{' '}
            </span>
            <button
              type="button"
              disabled={offset + page.limit >= page.total || busy}
              onClick={() => setOffset(offset + 25)}
              className="min-h-11 rounded-lg border px-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
      {prefs && (
        <fieldset className="rounded-xl border border-midnight/10 bg-white p-4">
          <legend className="font-semibold">In-app preferences</legend>
          <p className="text-sm text-midnight/65">
            Security alerts are mandatory. Categories without implemented events will not generate
            alerts yet.
          </p>
          {categories.map((value) => (
            <label key={value} className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs[value]}
                disabled={busy || value === 'security'}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void run(() =>
                    apiRequest(
                      `notifications/preferences/${value}`,
                      jsonRequest('PUT', { enabled }),
                    ),
                  );
                }}
              />
              {value}
              {value === 'security' ? ' (required)' : ''}
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
