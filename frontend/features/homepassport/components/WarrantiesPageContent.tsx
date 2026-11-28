'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, LoaderCircle, Plus, ShieldCheck } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  createWarranty,
  getAppliance,
  listAppliances,
  listWarranties,
} from '@/lib/api/homepassport';
import type { Appliance, ApplianceDetail, Warranty, WarrantyType } from '@/lib/api/homepassport';
import { warrantyTypeLabels } from '@/lib/api/homepassport';
import {
  LoadingNotice,
  messageForPassportError,
  Notice,
  VerificationPill,
  WarrantyStatusPill,
  inputClass,
  labelClass,
  selectClass,
} from './passport-ui';

const blankForm = {
  warranty_type: 'manufacturer' as WarrantyType,
  appliance_id: '',
  part_id: '',
  provider: '',
  reference_number: '',
  start_date: '',
  end_date: '',
  terms_summary: '',
  create_expiry_reminder: true,
};

export function WarrantiesPageContent() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [applianceParts, setApplianceParts] = useState<ApplianceDetail['parts']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [warrantyBody, applianceBody] = await Promise.all([
        listWarranties(),
        listAppliances(false),
      ]);
      setWarranties(warrantyBody.items);
      setAppliances(applianceBody.items);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!form.appliance_id) {
      setApplianceParts([]);
      return;
    }
    let active = true;
    getAppliance(form.appliance_id)
      .then((detail) => {
        if (active) setApplianceParts(detail.parts);
      })
      .catch(() => {
        if (active) setApplianceParts([]);
      });
    return () => {
      active = false;
    };
  }, [form.appliance_id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!form.appliance_id) {
      setFormError('Select an appliance for this warranty.');
      return;
    }
    setSaving(true);
    try {
      await createWarranty({
        warranty_type: form.warranty_type,
        appliance_id: form.appliance_id,
        part_id: form.part_id || null,
        provider: form.provider.trim(),
        reference_number: form.reference_number.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
        terms_summary: form.terms_summary.trim() || null,
        create_expiry_reminder: form.create_expiry_reminder,
      });
      setForm(blankForm);
      setCreating(false);
      setSuccess('Warranty saved. Its status comes from the recorded dates.');
      await load();
    } catch (caught) {
      setFormError(messageForPassportError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Warranty vault"
          title="Warranties, tracked honestly."
          description="Loading the warranty records linked to your FixNear account."
        />
        <LoadingNotice />
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        eyebrow="Warranty vault"
        title="Warranties, tracked honestly."
        description="Statuses are derived from the recorded start and end dates plus any claim you file. FixNear does not extend, validate or guarantee coverage — the issuing provider’s recorded terms decide claims."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-midnight">Your warranty records</h2>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          aria-expanded={creating}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
        >
          {creating ? null : <Plus size={16} aria-hidden="true" />}
          {creating ? 'Close form' : 'Add warranty'}
        </button>
      </div>

      {creating ? (
        <DashboardCard
          title="Add a warranty record"
          description="Warranty dates and providers come from the document or provider itself. FixNear does not verify coverage."
          icon={ShieldCheck}
          className="mt-4"
        >
          <form onSubmit={submit} className="grid gap-4">
            {formError ? <Notice kind="error">{formError}</Notice> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="warranty-type">
                  Warranty type *
                </label>
                <select
                  id="warranty-type"
                  className={selectClass}
                  value={form.warranty_type}
                  onChange={(event) =>
                    setForm({ ...form, warranty_type: event.target.value as WarrantyType })
                  }
                >
                  {(Object.entries(warrantyTypeLabels) as [WarrantyType, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="warranty-appliance">
                  Appliance *
                </label>
                <select
                  id="warranty-appliance"
                  className={selectClass}
                  required
                  value={form.appliance_id}
                  onChange={(event) =>
                    setForm({ ...form, appliance_id: event.target.value, part_id: '' })
                  }
                >
                  <option value="">Select an appliance…</option>
                  {appliances.map((appliance) => (
                    <option key={appliance.id} value={appliance.id}>
                      {appliance.name}
                    </option>
                  ))}
                </select>
                {appliances.length === 0 ? (
                  <p className="text-xs text-midnight/55">
                    Add an appliance in HomePassport first.
                  </p>
                ) : null}
              </div>
              {applianceParts.length > 0 ? (
                <div className="grid gap-1.5 sm:col-span-2">
                  <label className={labelClass} htmlFor="warranty-part">
                    Specific replaced part{' '}
                    <span className="font-normal text-midnight/45">(optional)</span>
                  </label>
                  <select
                    id="warranty-part"
                    className={selectClass}
                    value={form.part_id}
                    onChange={(event) => setForm({ ...form, part_id: event.target.value })}
                  >
                    <option value="">Whole appliance (not a specific part)</option>
                    {applianceParts.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.part_name} — replaced {part.replacement_date}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="warranty-provider">
                  Provider / company *
                </label>
                <input
                  id="warranty-provider"
                  required
                  minLength={2}
                  maxLength={160}
                  className={inputClass}
                  placeholder="e.g. Daikin Home Warranty"
                  value={form.provider}
                  onChange={(event) => setForm({ ...form, provider: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="warranty-reference">
                  Reference number <span className="font-normal text-midnight/45">(optional)</span>
                </label>
                <input
                  id="warranty-reference"
                  maxLength={120}
                  className={inputClass}
                  autoComplete="off"
                  value={form.reference_number}
                  onChange={(event) => setForm({ ...form, reference_number: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="warranty-start">
                  Start date *
                </label>
                <input
                  id="warranty-start"
                  type="date"
                  required
                  className={inputClass}
                  value={form.start_date}
                  onChange={(event) => setForm({ ...form, start_date: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="warranty-end">
                  End date *
                </label>
                <input
                  id="warranty-end"
                  type="date"
                  required
                  className={inputClass}
                  value={form.end_date}
                  onChange={(event) => setForm({ ...form, end_date: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <label className={labelClass} htmlFor="warranty-terms">
                  Terms summary{' '}
                  <span className="font-normal text-midnight/45">
                    (optional, from the document)
                  </span>
                </label>
                <textarea
                  id="warranty-terms"
                  maxLength={4000}
                  className={`${inputClass} min-h-24 py-3`}
                  value={form.terms_summary}
                  onChange={(event) => setForm({ ...form, terms_summary: event.target.value })}
                />
              </div>
            </div>
            <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-xl border border-midnight/12 bg-white px-3 text-sm font-medium text-midnight">
              <input
                type="checkbox"
                className="size-4 accent-midnight"
                checked={form.create_expiry_reminder}
                onChange={(event) =>
                  setForm({ ...form, create_expiry_reminder: event.target.checked })
                }
              />
              Remind me 30 days before this warranty expires
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : null}
                Save warranty
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCreating(false);
                  setForm(blankForm);
                }}
                className="inline-flex min-h-12 items-center rounded-xl border border-midnight/15 px-5 text-sm font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </DashboardCard>
      ) : null}

      {warranties.length === 0 && !error ? (
        <DashboardEmptyState
          icon={ShieldCheck}
          title="No warranty records yet"
          description="Add the manufacturer, extended, service or part warranties you hold. Statuses come from the dates you record — nothing here promises coverage."
        />
      ) : (
        <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
          {warranties.map((warranty) => (
            <article
              key={warranty.id}
              className="flex h-full flex-col rounded-2xl border border-midnight/10 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-midnight/50">
                  {warrantyTypeLabels[warranty.warranty_type]}
                </p>
                <WarrantyStatusPill status={warranty.status} />
              </div>
              <h3 className="mt-2 text-base font-semibold text-midnight">{warranty.provider}</h3>
              <p className="mt-0.5 text-xs text-midnight/60">
                {warranty.appliance_name ?? warranty.part_name ?? 'Linked record'} ·{' '}
                {warranty.start_date} → {warranty.end_date}
              </p>
              <p className="mt-1 text-xs text-midnight/55">
                {warranty.days_remaining >= 0
                  ? `${warranty.days_remaining} day(s) until the recorded end date`
                  : `Ended ${-warranty.days_remaining} day(s) ago`}
                {warranty.reference_number ? ` · Ref ${warranty.reference_number}` : ''}
              </p>
              <div className="mt-3">
                <VerificationPill status={warranty.verification_status} />
              </div>
              <Link
                href={`/dashboard/warranties/${warranty.id}`}
                className="mt-4 inline-flex min-h-10 w-fit items-center gap-1.5 rounded-xl border border-midnight/15 px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
              >
                Open warranty record <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      )}

      <aside className="mt-6 rounded-2xl border border-midnight/10 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-midnight">Before you rely on a warranty</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-midnight/65">
          Warranty documents, dates and reference numbers recorded here help you organise claims.
          The issuing provider decides coverage, exclusions and claim outcomes. FixNear records do
          not extend coverage, and a FixNear “verified” label means the provider’s details were
          checked by support — not that a claim will be paid.
        </p>
      </aside>
    </>
  );
}
