'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  BellRing,
  CalendarClock,
  ChevronRight,
  LoaderCircle,
  PackageMinus,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
  House,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { deleteAppliance, formatPaise, listAppliances, getOverview } from '@/lib/api/homepassport';
import type { Appliance, HomePassportOverview } from '@/lib/api/homepassport';
import { applianceCategoryLabels } from '@/lib/api/homepassport';
import { ApplianceForm } from './ApplianceForm';
import { CategoryIcon, LoadingNotice, messageForPassportError, Notice } from './passport-ui';

export function HomePassportPageContent() {
  const [overview, setOverview] = useState<HomePassportOverview | null>(null);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (includeArchived: boolean) => {
    setError(null);
    try {
      const [overviewBody, applianceBody] = await Promise.all([
        getOverview(),
        listAppliances(includeArchived),
      ]);
      setOverview(overviewBody);
      setAppliances(applianceBody.items);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(showArchived);
  }, [load, showArchived]);

  async function handleDelete(appliance: Appliance) {
    setBusyId(appliance.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteAppliance(appliance.id);
      setConfirmingDelete(null);
      setSuccess(`"${appliance.name}" was deleted.`);
      await load(showArchived);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="HomePassport"
          title="Your appliances, service history and warranties in one place."
          description="Loading the records linked to your FixNear account."
        />
        <LoadingNotice />
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        eyebrow="HomePassport"
        title="Your appliances, service history and warranties in one place."
        description="Appliance records are linked to the warranties, service history, parts, documents and reminders stored for your FixNear account. Warranty coverage is always subject to the provider’s recorded terms."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      {overview ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Appliances', value: overview.total_appliances },
            { label: 'Active warranties', value: overview.active_warranties },
            {
              label: 'Expiring in 30 days',
              value: overview.expiring_warranties_30d,
            },
            { label: 'Open warranty claims', value: overview.open_claims },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5"
            >
              <p className="text-2xl font-semibold tabular-nums text-midnight sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs leading-5 text-midnight/60">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-midnight">
          {showArchived ? 'All appliances (including archived)' : 'Your appliances'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-midnight/12 bg-white px-3 text-sm font-medium text-midnight">
            <input
              type="checkbox"
              className="size-4 accent-midnight"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            aria-expanded={creating}
          >
            {creating ? null : <Plus size={16} aria-hidden="true" />}
            {creating ? 'Close form' : 'Add appliance'}
          </button>
        </div>
      </div>

      {creating ? (
        <DashboardCard
          title="Add a new appliance"
          description="Only the starred details are required. Optional purchase, serial and seller details stay on your account."
          icon={House}
          className="mt-4"
        >
          <ApplianceForm
            onSaved={async () => {
              setCreating(false);
              setSuccess('Appliance saved to your HomePassport.');
              await load(showArchived);
            }}
            onCancel={() => setCreating(false)}
          />
        </DashboardCard>
      ) : null}

      {appliances.length === 0 && !error ? (
        <DashboardEmptyState
          icon={House}
          title="No appliances in your HomePassport yet"
          description="Add the first appliance you want to track. Verified FixNear service records will appear automatically when a booking linked to the appliance is completed."
        />
      ) : (
        <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
          {appliances.map((appliance) => (
            <article
              key={appliance.id}
              className="rounded-2xl border border-midnight/10 bg-white p-5"
            >
              <div className="flex items-start gap-3">
                <CategoryIcon category={appliance.category} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-midnight">{appliance.name}</h3>
                    {appliance.is_archived ? (
                      <span className="inline-flex min-h-6 items-center rounded-full bg-[#f1f3f5] px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/60">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-midnight/60">
                    {applianceCategoryLabels[appliance.category]} · {appliance.brand}{' '}
                    {appliance.model_number}
                  </p>
                  <p className="mt-1 text-xs text-midnight/50">
                    {appliance.purchase_date
                      ? `Purchased ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${appliance.purchase_date}T12:00:00Z`))}`
                      : 'Purchase date not recorded'}
                    {appliance.purchase_price_paise != null
                      ? ` · ${formatPaise(appliance.purchase_price_paise)}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/dashboard/homepassport/${appliance.id}`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-midnight/15 bg-white px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                >
                  Open record <ChevronRight size={14} aria-hidden="true" />
                </Link>
                {confirmingDelete === appliance.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[#8d3028]">
                      Delete permanently? Service history blocks deletion.
                    </span>
                    <button
                      type="button"
                      disabled={busyId === appliance.id}
                      onClick={() => void handleDelete(appliance)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#d99b93] px-3 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
                    >
                      {busyId === appliance.id ? (
                        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 size={14} aria-hidden="true" />
                      )}
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(appliance.id)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-midnight/60 hover:text-[#8d3028] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                  >
                    <Trash2 size={14} aria-hidden="true" /> Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {overview &&
      (overview.recent_service_history.length > 0 || overview.recent_parts.length > 0) ? (
        <div className="mt-6 grid items-start gap-4 xl:grid-cols-2">
          <DashboardCard
            title="Recent service history"
            description="FixNear-verified records and entries you added yourself."
            icon={Wrench}
          >
            <ul className="grid gap-3">
              {overview.recent_service_history.slice(0, 5).map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                    {new Intl.DateTimeFormat('en-IN', {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    }).format(new Date(`${entry.service_date}T12:00:00Z`))}{' '}
                    · {entry.service_category}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-midnight/80">
                    {entry.work_performed ?? entry.problem_description ?? 'Service recorded'}
                  </p>
                  <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/45">
                    {entry.source === 'fixnear_verified'
                      ? 'Verified FixNear service'
                      : 'Customer reported · not verified'}
                  </p>
                </li>
              ))}
            </ul>
          </DashboardCard>

          <DashboardCard
            title="Recently replaced parts"
            description="Parts recorded on verified jobs and entries you added yourself."
            icon={PackageMinus}
          >
            <ul className="grid gap-3">
              {overview.recent_parts.slice(0, 5).map((part) => (
                <li key={part.id} className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-4">
                  <p className="text-sm font-semibold text-midnight">
                    {part.quantity} × {part.part_name}
                  </p>
                  <p className="mt-0.5 text-xs text-midnight/60">
                    {part.replacement_date}
                    {part.total_price_paise != null
                      ? ` · ${formatPaise(part.total_price_paise)}`
                      : ' · price not documented'}
                  </p>
                  <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/45">
                    {part.source === 'fixnear_verified'
                      ? 'Verified FixNear record'
                      : 'Customer reported · not verified'}
                  </p>
                </li>
              ))}
            </ul>
          </DashboardCard>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/warranties"
          className="flex items-center gap-3 rounded-2xl border border-midnight/10 bg-white p-5 transition-colors hover:bg-[#f7f9fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
        >
          <ShieldCheck
            aria-hidden="true"
            className="text-midnight/70"
            size={22}
            strokeWidth={1.8}
          />
          <span>
            <span className="block text-sm font-semibold text-midnight">Warranty vault</span>
            <span className="mt-0.5 block text-xs text-midnight/60">
              Track statuses from recorded start and end dates.
            </span>
          </span>
          <ChevronRight aria-hidden="true" size={18} className="ml-auto text-midnight/40" />
        </Link>
        <Link
          href="/dashboard/claims"
          className="flex items-center gap-3 rounded-2xl border border-midnight/10 bg-white p-5 transition-colors hover:bg-[#f7f9fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
        >
          <CalendarClock
            aria-hidden="true"
            className="text-midnight/70"
            size={22}
            strokeWidth={1.8}
          />
          <span>
            <span className="block text-sm font-semibold text-midnight">Warranty claims</span>
            <span className="mt-0.5 block text-xs text-midnight/60">
              File and follow the status of claims with the issuing provider.
            </span>
          </span>
          <ChevronRight aria-hidden="true" size={18} className="ml-auto text-midnight/40" />
        </Link>
      </div>

      <p className="mt-6 inline-flex items-center gap-2 text-xs text-midnight/45">
        <BellRing size={14} aria-hidden="true" /> Reminders are configured per appliance — open an
        appliance record to add maintenance reminders.
        <Archive size={14} aria-hidden="true" className="ml-3" /> Archived appliances stay out of
        lists but keep their history.
      </p>
    </>
  );
}
