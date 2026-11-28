'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminErrorState, AdminLoadingState } from '@/features/admin/components/AdminShell';
import {
  adminErrorMessage,
  formatDateTime,
  isForbidden,
} from '@/features/admin/components/admin-errors';
import { listAudit } from '@/lib/api/admin';
import type { AuditEntry, AuditList } from '@/lib/api/admin';

const PAGE_SIZE = 25;

const SOURCE_LABELS: Record<string, string> = {
  user: 'Accounts',
  catalog: 'Catalog',
  booking: 'Bookings',
  homepassport: 'HomePassport',
  verification: 'Verification',
  operations: 'Operations',
};

export function AdminAuditPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [applied, setApplied] = useState({
    date_from: '',
    date_to: '',
    action: '',
    entity_type: '',
  });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listAudit({
      date_from: applied.date_from || undefined,
      date_to: applied.date_to || undefined,
      action: applied.action || undefined,
      entity_type: applied.entity_type || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((result) => setData(result))
      .catch((requestError: unknown) => {
        setForbidden(isForbidden(requestError));
        setError(adminErrorMessage(requestError, 'The audit log could not be loaded.'));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [applied, page]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setApplied({
      date_from: dateFrom,
      date_to: dateTo,
      action: action.trim(),
      entity_type: entityType.trim(),
    });
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setAction('');
    setEntityType('');
    setApplied({ date_from: '', date_to: '', action: '', entity_type: '' });
    setPage(0);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Unified, append-only record of admin decisions and system events across modules. Entries are never edited or deleted from this view."
      />

      <DashboardCard
        title="Filters"
        description="Narrow by period, action slug (exact match, e.g. review.hidden, status.changed) or entity type."
        icon={Filter}
        className="mb-5"
      >
        <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-midnight">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 block min-h-10 rounded-xl border border-midnight/15 px-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
            />
          </label>
          <label className="text-xs font-semibold text-midnight">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 block min-h-10 rounded-xl border border-midnight/15 px-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
            />
          </label>
          <label className="text-xs font-semibold text-midnight">
            Action
            <input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="exact slug, e.g. review.hidden"
              className="mt-1 block min-h-10 w-48 rounded-xl border border-midnight/15 px-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
            />
          </label>
          <label className="text-xs font-semibold text-midnight">
            Entity type
            <input
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="exact, e.g. review"
              className="mt-1 block min-h-10 w-40 rounded-xl border border-midnight/15 px-3 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
            />
          </label>
          <span className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-xl bg-midnight px-4 text-xs font-semibold text-white"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 px-4 text-xs font-semibold text-midnight"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={load}
              aria-label="Refresh audit log"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-midnight/15 text-midnight"
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </span>
        </form>
      </DashboardCard>

      {loading ? <AdminLoadingState label="Loading audit entries…" /> : null}
      {error && forbidden ? <AdminErrorState message={error} /> : null}
      {error && !forbidden ? <AdminErrorState message={error} onRetry={load} /> : null}

      {data && !loading && !error ? (
        data.items.length === 0 ? (
          <p className="text-sm text-midnight/55">No audit entries match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-midnight/10 bg-white">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-midnight/10 bg-[#f8faf7] text-[0.65rem] uppercase tracking-wide text-midnight/50">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      When
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Source
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Action
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Entity
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Actor
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-midnight/8">
                  {data.items.map((entry: AuditEntry, index) => (
                    <tr key={entry.id ?? `${entry.created_at}-${index}`} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-midnight/70">
                        {formatDateTime(entry.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex min-h-6 items-center rounded-full bg-[#eef2ec] px-2.5 text-[0.65rem] font-semibold text-midnight/80">
                          {SOURCE_LABELS[entry.source] ?? entry.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[0.7rem] text-midnight">
                        {entry.action}
                      </td>
                      <td className="px-4 py-3 text-midnight/70">
                        {entry.entity_type}
                        {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}…` : ''}
                      </td>
                      <td className="px-4 py-3 text-midnight/70">
                        {entry.actor_label ?? 'System'}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-midnight/60">
                        {entry.note ?? entry.detail ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-midnight/60">
              <span className="tabular-nums">
                {data.total} entries · page {page + 1} of {totalPages}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Previous page"
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-midnight/15 disabled:opacity-40"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages}
                  aria-label="Next page"
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-midnight/15 disabled:opacity-40"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </span>
            </div>
          </>
        )
      ) : null}
    </>
  );
}
