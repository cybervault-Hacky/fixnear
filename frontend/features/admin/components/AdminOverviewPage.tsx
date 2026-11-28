'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  LifeBuoy,
  RefreshCw,
  Star,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { AdminErrorState, AdminLoadingState } from '@/features/admin/components/AdminShell';
import {
  adminErrorMessage,
  formatDateTime,
  isForbidden,
  titleCaseSlug,
} from '@/features/admin/components/admin-errors';
import { getOverview } from '@/lib/api/admin';
import type { AdminOverview } from '@/lib/api/admin';

const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

function metricCards(overview: AdminOverview) {
  const m = overview.metrics;
  return [
    { label: 'Registered customers', value: m.total_customers, icon: Users },
    { label: 'Registered technicians', value: m.total_technicians, icon: Wrench },
    {
      label: 'Verified technicians',
      value: m.verified_technicians ?? 'Not tracked',
      icon: BadgeCheck,
    },
    {
      label: 'Pending verifications',
      value: m.pending_technician_verifications ?? 'Not tracked',
      icon: UserCog,
    },
    { label: 'Total bookings', value: m.total_bookings, icon: ClipboardList },
    { label: 'Active bookings', value: m.active_bookings, icon: CalendarClock },
    { label: 'Completed bookings', value: m.completed_bookings, icon: ClipboardCheck },
    { label: 'Cancelled bookings', value: m.cancelled_bookings, icon: AlertCircle },
    { label: 'Pending quotations', value: m.pending_quotations, icon: Banknote },
    { label: 'Approved quotations', value: m.approved_quotations, icon: BadgeCheck },
    { label: 'Open support tickets', value: m.open_support_tickets, icon: LifeBuoy },
    {
      label: 'Average rating',
      value:
        m.average_rating === null
          ? 'Not available'
          : `${m.average_rating.toFixed(2)} / 5 (${m.review_count} reviews)`,
      icon: Star,
    },
  ];
}

function BookingTrendChart({ data }: { data: AdminOverview['booking_trend'] }) {
  const max = Math.max(1, ...data.map((point) => point.count));
  const labelEvery = Math.ceil(data.length / 6);
  return (
    <figure>
      <svg
        viewBox={`0 0 ${data.length * 14} 120`}
        className="h-32 w-full"
        role="img"
        aria-label={`Bookings created per day over the last ${data.length} days`}
        preserveAspectRatio="none"
      >
        {data.map((point, index) => {
          const height = (point.count / max) * 84;
          return (
            <rect
              key={point.date}
              x={index * 14 + 2}
              y={92 - height}
              width={10}
              height={Math.max(height, point.count > 0 ? 2 : 0)}
              rx={1.5}
              className="fill-midnight/75"
            >
              <title>{`${point.date}: ${point.count} booking${point.count === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
        <line
          x1="0"
          y1="92"
          x2={data.length * 14}
          y2="92"
          className="stroke-midnight/20"
          strokeWidth="1"
        />
      </svg>
      <figcaption className="mt-2 flex justify-between text-[0.65rem] text-midnight/50">
        {data
          .filter((_, index) => index % labelEvery === 0 || index === data.length - 1)
          .map((point) => (
            <span key={point.date}>
              {new Date(point.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}

function HorizontalBars({
  items,
  emptyLabel,
  formatLabel = (value: string) => value,
}: {
  items: { label: string; count: number }[];
  emptyLabel: string;
  formatLabel?: (value: string) => string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  const visible = items.filter((item) => item.count > 0);
  if (visible.length === 0) {
    return <p className="text-sm text-midnight/55">{emptyLabel}</p>;
  }
  return (
    <ul className="grid gap-2">
      {visible.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <span className="min-w-0">
            <span className="mb-1 block truncate text-xs font-medium text-midnight/80">
              {formatLabel(item.label)}
            </span>
            <span
              className="block h-2 rounded-full bg-midnight/75"
              style={{ width: `${(item.count / max) * 100}%` }}
              aria-hidden="true"
            />
          </span>
          <span className="text-xs font-semibold tabular-nums text-midnight/80">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

function SatisfactionChart({ data }: { data: AdminOverview['satisfaction_trend'] }) {
  const rated = data.filter((point) => point.average_rating !== null);
  if (rated.length === 0) {
    return <p className="text-sm text-midnight/55">No published reviews in this range yet.</p>;
  }
  const width = 100;
  const height = 40;
  const maxX = Math.max(1, rated.length - 1);
  const points = rated.map((point, index) => {
    const x = (index / maxX) * (width - 8) + 4;
    const y = height - 6 - ((point.average_rating ?? 0) / 5) * (height - 12);
    return { x, y, point };
  });
  const path = points.map(({ x, y }) => `${x},${y}`).join(' ');
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full"
        role="img"
        aria-label="Weekly average rating trend"
        preserveAspectRatio="none"
      >
        {[1, 2, 3, 4, 5].map((level) => (
          <line
            key={level}
            x1="0"
            x2={width}
            y1={height - 6 - (level / 5) * (height - 12)}
            y2={height - 6 - (level / 5) * (height - 12)}
            className="stroke-midnight/10"
            strokeWidth="0.4"
          />
        ))}
        <polyline
          points={path}
          fill="none"
          className="stroke-midnight"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map(({ x, y, point }) => (
          <circle key={point.week_start} cx={x} cy={y} r="1.6" className="fill-midnight">
            <title>{`Week of ${point.week_start}: ${point.average_rating} (${point.review_count} review${point.review_count === 1 ? '' : 's'})`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-[0.65rem] text-midnight/50">
        {rated.map((point) => (
          <span key={point.week_start}>
            {new Date(point.week_start).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
            })}
            : {point.average_rating}★ · {point.review_count}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function AdminOverviewPage() {
  const [range, setRange] = useState<RangeDays>(30);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getOverview(range)
      .then((result) => setOverview(result))
      .catch((requestError: unknown) => {
        setForbidden(isForbidden(requestError));
        setError(adminErrorMessage(requestError, 'The admin overview could not be loaded.'));
        setOverview(null);
      })
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin"
        title="Platform overview"
        description="Database-backed metrics for the FixNear platform. Counts come straight from production tables; an unavailable metric is shown as such, never as a zero."
        action={
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Date range"
              className="inline-flex rounded-xl border border-midnight/15 bg-white p-1"
            >
              {RANGE_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRange(value)}
                  aria-pressed={range === value}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                    range === value
                      ? 'bg-midnight text-white'
                      : 'text-midnight/70 hover:text-midnight'
                  }`}
                >
                  {value}d
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-midnight/15 bg-white text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
              aria-label="Refresh metrics"
            >
              <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      {loading && !overview ? <AdminLoadingState label="Loading platform metrics…" /> : null}
      {error && forbidden ? <AdminErrorState message={error} /> : null}
      {error && !forbidden ? <AdminErrorState message={error} onRetry={load} /> : null}

      {overview ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {metricCards(overview).map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-2xl border border-midnight/10 bg-white p-4"
                >
                  <Icon size={16} aria-hidden="true" className="text-midnight/45" />
                  <p className="mt-2 text-lg font-semibold leading-tight text-midnight">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[0.7rem] leading-4 text-midnight/55">{card.label}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
            <DashboardCard
              title="Booking trend"
              description={`Requests created per day, last ${range} days.`}
              icon={Gauge}
            >
              <BookingTrendChart data={overview.booking_trend} />
            </DashboardCard>
            <DashboardCard
              title="Booking status distribution"
              description="All bookings by current lifecycle status."
              icon={ClipboardList}
            >
              <HorizontalBars
                items={overview.status_distribution.map((point) => ({
                  label: point.status.replaceAll('_', ' '),
                  count: point.count,
                }))}
                emptyLabel="No bookings recorded yet."
              />
            </DashboardCard>
            <DashboardCard
              title="Service category popularity"
              description="Most-requested services by booked jobs."
              icon={Wrench}
            >
              <HorizontalBars
                items={overview.category_popularity.map((point) => ({
                  label: point.service_slug,
                  count: point.count,
                }))}
                emptyLabel="No bookings recorded yet."
                formatLabel={titleCaseSlug}
              />
            </DashboardCard>
            <DashboardCard
              title="Technician performance"
              description="Completed jobs and verified ratings per technician."
              icon={BadgeCheck}
            >
              {overview.technician_performance.length === 0 ? (
                <p className="text-sm text-midnight/55">
                  No completed jobs with an assigned technician yet.
                </p>
              ) : (
                <ul className="grid gap-3">
                  {overview.technician_performance.map((entry) => (
                    <li
                      key={entry.technician_user_id}
                      className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-midnight">{entry.display_name}</p>
                        <p className="text-xs font-semibold text-midnight/75">
                          {entry.completed_bookings} completed ·{' '}
                          {entry.average_rating === null
                            ? `no reviews yet`
                            : `${entry.average_rating.toFixed(1)}★ (${entry.review_count})`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
            <DashboardCard
              title="Customer satisfaction trend"
              description="Weekly average rating from verified reviews."
              icon={Star}
            >
              <SatisfactionChart data={overview.satisfaction_trend} />
            </DashboardCard>
            <DashboardCard
              title="Recent platform activity"
              description="Latest audited events across all modules."
              icon={CalendarClock}
            >
              {overview.recent_activity.length === 0 ? (
                <p className="text-sm text-midnight/55">
                  No audited activity yet. Admin actions appear here once they happen.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {overview.recent_activity.map((entry, index) => (
                    <li
                      key={`${entry.created_at}-${index}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-midnight/6 pb-2 text-xs last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold text-midnight">{entry.action}</span>
                        <span className="text-midnight/55">
                          {' '}
                          · {entry.entity_type} · {entry.source}
                        </span>
                        {entry.actor_label ? (
                          <span className="text-midnight/55"> · {entry.actor_label}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-midnight/50">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/admin/audit"
                className="mt-3 inline-flex text-xs font-semibold text-midnight underline underline-offset-2 hover:text-midnight/80"
              >
                Open full audit log →
              </Link>
            </DashboardCard>
          </div>
        </>
      ) : null}
    </>
  );
}
