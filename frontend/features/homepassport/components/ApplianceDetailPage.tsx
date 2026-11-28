'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  LoaderCircle,
  PackageMinus,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
  BellRing,
  NotebookPen,
} from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  addCustomerPart,
  addCustomerServiceHistory,
  archiveAppliance,
  unarchiveAppliance,
  createReminder,
  deleteAppliance,
  deletePart,
  deleteReminder,
  deleteServiceHistory,
  formatPaise,
  getAppliance,
  rupeesToPaise,
  setServiceHistoryFeedback,
  updateReminder,
} from '@/lib/api/homepassport';
import type { ApplianceDetail, ReplacedPart } from '@/lib/api/homepassport';
import { applianceCategoryLabels } from '@/lib/api/homepassport';
import { ApplianceForm } from './ApplianceForm';
import {
  CategoryIcon,
  LoadingNotice,
  messageForPassportError,
  Notice,
  SourceBadge,
  WarrantyStatusPill,
  inputClass,
  labelClass,
  selectClass,
  ToggleField,
} from './passport-ui';

function CollapsibleSection({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-midnight/10 pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-midnight underline decoration-midnight/25 underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-midnight"
      >
        <Plus
          size={15}
          aria-hidden="true"
          className={open ? 'rotate-45 transition-transform' : 'transition-transform'}
        />
        {title}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function ApplianceDetailPage({ applianceId }: { applianceId: string }) {
  const router = useRouter();
  const [appliance, setAppliance] = useState<ApplianceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [historyFormOpen, setHistoryFormOpen] = useState(false);
  const [partsFormOpen, setPartsFormOpen] = useState(false);
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState<string | null>(null);

  const [historyForm, setHistoryForm] = useState({
    service_date: '',
    service_category: '',
    provider_name: '',
    problem_description: '',
    work_performed: '',
    labour_charges_rupees: '',
  });
  const [partForm, setPartForm] = useState({
    part_name: '',
    part_category: '',
    brand: '',
    part_number: '',
    quantity: '1',
    replacement_date: '',
    unit_price_rupees: '',
    technician_notes: '',
  });
  const [reminderForm, setReminderForm] = useState({
    title: '',
    due_date: '',
    reminder_type: 'scheduled_maintenance' as 'scheduled_maintenance' | 'custom',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const body = await getAppliance(applianceId);
      setAppliance(body);
    } catch (caught) {
      setError(messageForPassportError(caught));
      setAppliance(null);
    } finally {
      setLoading(false);
    }
  }, [applianceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="HomePassport · appliance record"
          title="Loading appliance record…"
          description="Fetching the service history, parts, warranties, reminders and documents linked to this appliance."
        />
        <LoadingNotice />
      </>
    );
  }

  if (!appliance) {
    return (
      <>
        <Link
          href="/dashboard/homepassport"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-midnight underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to HomePassport
        </Link>
        <div className="mt-4">
          <Notice kind="error">{error ?? 'Appliance not found.'}</Notice>
        </div>
      </>
    );
  }

  const archive = () =>
    run(async () => {
      if (appliance.is_archived) {
        await unarchiveAppliance(appliance.id);
        setSuccess('Appliance restored to your active list.');
      } else {
        await archiveAppliance(appliance.id);
        setSuccess('Appliance archived. Its history is preserved.');
      }
      await load();
    });

  const removeAppliance = () =>
    run(async () => {
      await deleteAppliance(appliance.id);
      router.push('/dashboard/homepassport');
    });

  const saveHistory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const labour = rupeesToPaise(historyForm.labour_charges_rupees);
    if (!historyForm.problem_description.trim() && !historyForm.work_performed.trim()) {
      setFormError('Describe the problem or the work that was performed.');
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      await addCustomerServiceHistory(appliance.id, {
        service_date: historyForm.service_date,
        service_category: historyForm.service_category.trim(),
        provider_name: historyForm.provider_name.trim() || null,
        problem_description: historyForm.problem_description.trim() || null,
        work_performed: historyForm.work_performed.trim() || null,
        labour_charges_paise: labour,
      });
      setHistoryForm({
        service_date: '',
        service_category: '',
        provider_name: '',
        problem_description: '',
        work_performed: '',
        labour_charges_rupees: '',
      });
      setHistoryFormOpen(false);
      setSuccess('Customer-reported service entry saved. It is labelled unverified.');
      await load();
    } catch (caught) {
      setFormError(messageForPassportError(caught));
    } finally {
      setFormSaving(false);
    }
  };

  const savePart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const unit = rupeesToPaise(partForm.unit_price_rupees);
    setFormSaving(true);
    setFormError(null);
    try {
      await addCustomerPart(appliance.id, {
        part_name: partForm.part_name.trim(),
        part_category: partForm.part_category.trim() || null,
        brand: partForm.brand.trim() || null,
        part_number: partForm.part_number.trim() || null,
        quantity: Math.max(1, Number.parseInt(partForm.quantity, 10) || 1),
        replacement_date: partForm.replacement_date,
        unit_price_paise: unit,
        technician_notes: partForm.technician_notes.trim() || null,
      });
      setPartForm({
        part_name: '',
        part_category: '',
        brand: '',
        part_number: '',
        quantity: '1',
        replacement_date: '',
        unit_price_rupees: '',
        technician_notes: '',
      });
      setPartsFormOpen(false);
      setSuccess('Part recorded. Customer-reported parts are labelled unverified.');
      await load();
    } catch (caught) {
      setFormError(messageForPassportError(caught));
    } finally {
      setFormSaving(false);
    }
  };

  const saveReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      await createReminder({
        reminder_type: reminderForm.reminder_type,
        title: reminderForm.title.trim(),
        due_date: reminderForm.due_date,
        timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        appliance_id: appliance.id,
      });
      setReminderForm({ title: '', due_date: '', reminder_type: 'scheduled_maintenance' });
      setReminderFormOpen(false);
      setSuccess('Reminder saved. You will see it in your maintenance reminders.');
      await load();
    } catch (caught) {
      setFormError(messageForPassportError(caught));
    } finally {
      setFormSaving(false);
    }
  };

  const saveFeedback = async (historyId: string) => {
    const draft = (feedbackDrafts[historyId] ?? '').trim();
    setSavingFeedback(historyId);
    setError(null);
    try {
      await setServiceHistoryFeedback(historyId, draft === '' ? null : draft);
      setSuccess('Feedback saved.');
      await load();
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setSavingFeedback(null);
    }
  };

  const removePart = (part: ReplacedPart) =>
    run(async () => {
      await deletePart(part.id);
      setSuccess('Part removed.');
      await load();
    });

  return (
    <>
      <Link
        href="/dashboard/homepassport"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-midnight underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to HomePassport
      </Link>

      <DashboardPageHeader
        eyebrow="HomePassport · appliance record"
        title={appliance.name}
        description="Service records, replaced parts, warranties, documents and reminders linked to this appliance."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      <DashboardCard
        title="Appliance details"
        description="Stored on your FixNear account."
        icon={NotebookPen}
      >
        <div className="flex flex-wrap items-start gap-4">
          <CategoryIcon category={appliance.category} size={24} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <ApplianceForm
                appliance={appliance}
                onSaved={async () => {
                  setEditing(false);
                  setSuccess('Appliance details updated.');
                  await load();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-midnight">
                    {applianceCategoryLabels[appliance.category]} · {appliance.brand}
                  </p>
                  {appliance.is_archived ? (
                    <span className="inline-flex min-h-6 items-center rounded-full bg-[#f1f3f5] px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/60">
                      Archived
                    </span>
                  ) : null}
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm text-midnight/80 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Model
                    </dt>
                    <dd>{appliance.model_number}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Serial number
                    </dt>
                    <dd>{appliance.serial_number ?? 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Appliance photo
                    </dt>
                    <dd>
                      {appliance.has_photo ? 'On file' : 'Not recorded'}
                      <span className="block text-xs text-midnight/50">
                        Photo upload is not available until document storage is configured.
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Purchase date
                    </dt>
                    <dd>{appliance.purchase_date ?? 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Installation date
                    </dt>
                    <dd>{appliance.installation_date ?? 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Purchase price
                    </dt>
                    <dd>
                      {appliance.purchase_price_paise != null
                        ? formatPaise(appliance.purchase_price_paise)
                        : 'Not recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-midnight/45">
                      Seller / store
                    </dt>
                    <dd>{appliance.seller_name ?? 'Not recorded'}</dd>
                  </div>
                </dl>
                {appliance.notes ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-midnight/75">
                    {appliance.notes}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {!appliance.is_archived ? (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 bg-white px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      Edit details
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void archive()}
                    disabled={busy}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-midnight/15 bg-white px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                  >
                    {appliance.is_archived ? (
                      <>
                        <ArchiveRestore size={14} aria-hidden="true" /> Unarchive
                      </>
                    ) : (
                      <>
                        <Archive size={14} aria-hidden="true" /> Archive
                      </>
                    )}
                  </button>
                  {confirmingDelete ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-[#8d3028]">
                        Delete permanently?
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeAppliance()}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#d99b93] px-3 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                      >
                        {busy ? (
                          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 size={14} aria-hidden="true" />
                        )}
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-midnight/60 hover:text-[#8d3028] focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      <Trash2 size={14} aria-hidden="true" /> Delete
                    </button>
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-midnight/50">
                  Deletion is blocked while this appliance has service history, parts, warranties or
                  documents. Archiving preserves every record and removes the appliance from your
                  active lists.
                </p>
              </>
            )}
          </div>
        </div>
      </DashboardCard>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
        <DashboardCard
          title="Repair & service timeline"
          description="FixNear-verified jobs appear automatically when a linked booking is completed. Add entries you handled yourself."
          icon={Wrench}
        >
          {appliance.service_history.length === 0 ? (
            <p className="text-sm leading-6 text-midnight/60">
              No service records yet. Completed FixNear bookings linked to this appliance will
              appear here with the approved quote totals.
            </p>
          ) : (
            <ol className="grid gap-4">
              {appliance.service_history.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-midnight/12 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-midnight/50">
                      {entry.service_date} · {entry.service_category}
                    </p>
                    <SourceBadge source={entry.source} />
                  </div>
                  {entry.technician_name ? (
                    <p className="mt-1 text-xs text-midnight/55">
                      Technician: {entry.technician_name}
                    </p>
                  ) : null}
                  {entry.booking_reference ? (
                    <p className="mt-0.5 text-xs text-midnight/55">
                      Booking reference: {entry.booking_reference}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-midnight/85">
                    {entry.work_performed ?? entry.problem_description ?? 'Service completed.'}
                  </p>
                  <p className="mt-2 text-xs text-midnight/55">
                    {entry.approved_quote_total_paise != null
                      ? `Approved quote total ${formatPaise(entry.approved_quote_total_paise)}`
                      : null}
                    {entry.approved_quote_total_paise != null && entry.labour_charges_paise != null
                      ? ' · '
                      : ''}
                    {entry.labour_charges_paise != null
                      ? `Labour ${formatPaise(entry.labour_charges_paise)}`
                      : ''}
                  </p>
                  <div className="mt-3">
                    <label
                      className="text-xs font-semibold text-midnight/60"
                      htmlFor={`feedback-${entry.id}`}
                    >
                      Your feedback {entry.customer_feedback ? '' : '(optional)'}
                    </label>
                    <textarea
                      id={`feedback-${entry.id}`}
                      className={`${inputClass} mt-1 min-h-16 py-2 text-sm`}
                      value={feedbackDrafts[entry.id] ?? entry.customer_feedback ?? ''}
                      onChange={(event) =>
                        setFeedbackDrafts((drafts) => ({
                          ...drafts,
                          [entry.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      disabled={savingFeedback === entry.id}
                      onClick={() => void saveFeedback(entry.id)}
                      className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-midnight/15 px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                    >
                      {savingFeedback === entry.id ? 'Saving…' : 'Save feedback'}
                    </button>
                  </div>
                  {entry.source === 'customer_reported' ? (
                    <button
                      type="button"
                      onClick={() =>
                        run(async () => {
                          await deleteServiceHistory(entry.id);
                          setSuccess('Customer-reported entry removed.');
                          await load();
                        })
                      }
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/55 hover:text-[#8d3028] focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      <Trash2 size={14} aria-hidden="true" /> Remove entry
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {formError && historyFormOpen ? (
            <p className="mt-2 text-xs text-[#8d3028]">{formError}</p>
          ) : null}
          <CollapsibleSection
            open={historyFormOpen}
            onToggle={() => setHistoryFormOpen((value) => !value)}
            title="Add a service you handled yourself"
          >
            <form
              onSubmit={saveHistory}
              className="grid gap-3 rounded-xl border border-midnight/12 bg-[#f8faf7] p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label className={labelClass} htmlFor="history-date">
                    Service date *
                  </label>
                  <input
                    id="history-date"
                    type="date"
                    required
                    className={inputClass}
                    value={historyForm.service_date}
                    onChange={(event) =>
                      setHistoryForm({ ...historyForm, service_date: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className={labelClass} htmlFor="history-category">
                    Service category *
                  </label>
                  <input
                    id="history-category"
                    required
                    maxLength={80}
                    className={inputClass}
                    placeholder="e.g. AC repair"
                    value={historyForm.service_category}
                    onChange={(event) =>
                      setHistoryForm({ ...historyForm, service_category: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className={labelClass} htmlFor="history-provider">
                    Service provider / shop (optional)
                  </label>
                  <input
                    id="history-provider"
                    maxLength={160}
                    className={inputClass}
                    value={historyForm.provider_name}
                    onChange={(event) =>
                      setHistoryForm({ ...historyForm, provider_name: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className={labelClass} htmlFor="history-labour">
                    Labour charges (₹, optional)
                  </label>
                  <input
                    id="history-labour"
                    inputMode="decimal"
                    className={inputClass}
                    value={historyForm.labour_charges_rupees}
                    onChange={(event) =>
                      setHistoryForm({ ...historyForm, labour_charges_rupees: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <label className={labelClass} htmlFor="history-problem">
                    Problem description (optional)
                  </label>
                  <textarea
                    id="history-problem"
                    maxLength={2000}
                    className={`${inputClass} min-h-20 py-2`}
                    value={historyForm.problem_description}
                    onChange={(event) =>
                      setHistoryForm({ ...historyForm, problem_description: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <label className={labelClass} htmlFor="history-work">
                    Work performed (optional)
                  </label>
                  <textarea
                    id="history-work"
                    maxLength={2000}
                    className={`${inputClass} min-h-20 py-2`}
                    value={historyForm.work_performed}
                    onChange={(event) =>
                      setHistoryForm({ ...historyForm, work_performed: event.target.value })
                    }
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={formSaving}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
              >
                {formSaving ? (
                  <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                ) : null}
                Save unverified entry
              </button>
            </form>
          </CollapsibleSection>
        </DashboardCard>

        <div className="grid items-start gap-5">
          <DashboardCard
            title="Replaced parts"
            description="Parts recorded on verified jobs, plus entries you add yourself."
            icon={PackageMinus}
          >
            {appliance.parts.length === 0 ? (
              <p className="text-sm leading-6 text-midnight/60">
                No parts recorded yet. Completed FixNear jobs with approved part quotes will list
                their parts here.
              </p>
            ) : (
              <ul className="grid gap-3">
                {appliance.parts.map((part) => (
                  <li
                    key={part.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-midnight/12 bg-white p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-midnight">
                        {part.quantity} × {part.part_name}
                        {part.brand ? (
                          <span className="font-normal text-midnight/60"> · {part.brand}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-midnight/55">
                        {part.replacement_date}
                        {part.part_number ? ` · Part no. ${part.part_number}` : ''}
                        {part.total_price_paise != null
                          ? ` · ${formatPaise(part.total_price_paise)}`
                          : ' · price not documented'}
                      </p>
                      <div className="mt-1">
                        <SourceBadge source={part.source} />
                      </div>
                    </div>
                    {part.source === 'customer_reported' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removePart(part)}
                        aria-label={`Remove part ${part.part_name}`}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-midnight/50 hover:text-[#8d3028] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {formError && partsFormOpen ? (
              <p className="mt-2 text-xs text-[#8d3028]">{formError}</p>
            ) : null}
            <CollapsibleSection
              open={partsFormOpen}
              onToggle={() => setPartsFormOpen((value) => !value)}
              title="Record a part you replaced"
            >
              <form
                onSubmit={savePart}
                className="grid gap-3 rounded-xl border border-midnight/12 bg-[#f8faf7] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-name">
                      Part name *
                    </label>
                    <input
                      id="part-name"
                      required
                      maxLength={160}
                      className={inputClass}
                      value={partForm.part_name}
                      onChange={(event) =>
                        setPartForm({ ...partForm, part_name: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-category">
                      Part category (optional)
                    </label>
                    <input
                      id="part-category"
                      maxLength={80}
                      className={inputClass}
                      placeholder="e.g. filters"
                      value={partForm.part_category}
                      onChange={(event) =>
                        setPartForm({ ...partForm, part_category: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-brand">
                      Brand (optional)
                    </label>
                    <input
                      id="part-brand"
                      maxLength={120}
                      className={inputClass}
                      value={partForm.brand}
                      onChange={(event) => setPartForm({ ...partForm, brand: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-number">
                      Part / model number (optional)
                    </label>
                    <input
                      id="part-number"
                      maxLength={120}
                      className={inputClass}
                      value={partForm.part_number}
                      onChange={(event) =>
                        setPartForm({ ...partForm, part_number: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-quantity">
                      Quantity *
                    </label>
                    <input
                      id="part-quantity"
                      type="number"
                      min={1}
                      required
                      className={inputClass}
                      value={partForm.quantity}
                      onChange={(event) =>
                        setPartForm({ ...partForm, quantity: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-date">
                      Replacement date *
                    </label>
                    <input
                      id="part-date"
                      type="date"
                      required
                      className={inputClass}
                      value={partForm.replacement_date}
                      onChange={(event) =>
                        setPartForm({ ...partForm, replacement_date: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="part-unit-price">
                      Unit price (₹, optional)
                    </label>
                    <input
                      id="part-unit-price"
                      inputMode="decimal"
                      className={inputClass}
                      value={partForm.unit_price_rupees}
                      onChange={(event) =>
                        setPartForm({ ...partForm, unit_price_rupees: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <label className={labelClass} htmlFor="part-notes">
                      Technician / shop notes (optional)
                    </label>
                    <textarea
                      id="part-notes"
                      maxLength={2000}
                      className={`${inputClass} min-h-16 py-2`}
                      value={partForm.technician_notes}
                      onChange={(event) =>
                        setPartForm({ ...partForm, technician_notes: event.target.value })
                      }
                    />
                  </div>
                </div>
                <p className="text-xs leading-5 text-midnight/50">
                  FixNear does not verify that a part is genuine or manufacturer-approved. Only a
                  linked FixNear job can record a verified part.
                </p>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
                >
                  {formSaving ? (
                    <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Save part
                </button>
              </form>
            </CollapsibleSection>
          </DashboardCard>

          <DashboardCard
            title="Warranties for this appliance"
            description="Statuses come from recorded start and end dates and claim state."
            icon={ShieldCheck}
          >
            {appliance.warranties.length === 0 ? (
              <p className="text-sm leading-6 text-midnight/60">
                No warranty records linked to this appliance.{' '}
                <Link
                  href="/dashboard/warranties"
                  className="font-semibold underline underline-offset-4 hover:text-midnight"
                >
                  Add one in the warranty vault
                </Link>
                .
              </p>
            ) : (
              <ul className="grid gap-3">
                {appliance.warranties.map((warranty) => (
                  <li
                    key={warranty.id}
                    className="rounded-xl border border-midnight/12 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-midnight">{warranty.provider}</p>
                      <WarrantyStatusPill status={warranty.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-midnight/55">
                      {warranty.start_date} → {warranty.end_date}
                      {warranty.part_name ? ` · Part: ${warranty.part_name}` : ''}
                      {` · ${warranty.days_remaining >= 0 ? `${warranty.days_remaining} days remaining` : 'period ended'}`}
                    </p>
                    <Link
                      href={`/dashboard/warranties/${warranty.id}`}
                      className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-midnight underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      Open warranty record
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Maintenance reminders"
            description="In-app reminders for this appliance. Email and SMS are not configured."
            icon={BellRing}
          >
            {appliance.reminders.length === 0 ? (
              <p className="text-sm leading-6 text-midnight/60">No reminders yet.</p>
            ) : (
              <ul className="grid gap-3">
                {appliance.reminders.map((reminder) => (
                  <li
                    key={reminder.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-midnight/12 bg-white p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-midnight">{reminder.title}</p>
                      <p className="mt-0.5 text-xs text-midnight/55">
                        {reminder.due_date} · {reminder.timezone_name} ·{' '}
                        {reminder.reminder_type === 'warranty_expiry'
                          ? 'Warranty expiry'
                          : reminder.reminder_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ToggleField
                        id={`reminder-toggle-${reminder.id}`}
                        checked={reminder.is_enabled}
                        onChange={(checked) =>
                          run(async () => {
                            await updateReminder(reminder.id, { is_enabled: checked });
                            await load();
                          })
                        }
                        label={reminder.is_enabled ? 'Enabled' : 'Disabled'}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await deleteReminder(reminder.id);
                            setSuccess('Reminder deleted.');
                            await load();
                          })
                        }
                        aria-label={`Delete reminder ${reminder.title}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-midnight/50 hover:text-[#8d3028] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {formError && reminderFormOpen ? (
              <p className="mt-2 text-xs text-[#8d3028]">{formError}</p>
            ) : null}
            <CollapsibleSection
              open={reminderFormOpen}
              onToggle={() => setReminderFormOpen((value) => !value)}
              title="Add a reminder"
            >
              <form
                onSubmit={saveReminder}
                className="grid gap-3 rounded-xl border border-midnight/12 bg-[#f8faf7] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <label className={labelClass} htmlFor="reminder-title">
                      Reminder title *
                    </label>
                    <input
                      id="reminder-title"
                      required
                      maxLength={160}
                      className={inputClass}
                      placeholder="e.g. Annual AC servicing"
                      value={reminderForm.title}
                      onChange={(event) =>
                        setReminderForm({ ...reminderForm, title: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="reminder-date">
                      Due date *
                    </label>
                    <input
                      id="reminder-date"
                      type="date"
                      required
                      className={inputClass}
                      value={reminderForm.due_date}
                      onChange={(event) =>
                        setReminderForm({ ...reminderForm, due_date: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className={labelClass} htmlFor="reminder-type">
                      Type
                    </label>
                    <select
                      id="reminder-type"
                      className={selectClass}
                      value={reminderForm.reminder_type}
                      onChange={(event) =>
                        setReminderForm({
                          ...reminderForm,
                          reminder_type: event.target.value as 'scheduled_maintenance' | 'custom',
                        })
                      }
                    >
                      <option value="scheduled_maintenance">Scheduled maintenance</option>
                      <option value="custom">Custom reminder</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs leading-5 text-midnight/50">
                  Warranty expiry reminders are created automatically when you save a warranty.
                  Delivery channels (email, SMS, push) are not configured; reminders appear in this
                  dashboard only.
                </p>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
                >
                  {formSaving ? (
                    <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Save reminder
                </button>
              </form>
            </CollapsibleSection>
          </DashboardCard>
        </div>
      </div>

      <DashboardCard
        className="mt-5"
        title="Documents"
        description="Files linked to this appliance, warranty, claim or booking."
        icon={NotebookPen}
      >
        {appliance.documents.length === 0 ? (
          <p className="text-sm leading-6 text-midnight/60">
            No documents linked to this appliance. Manage files in{' '}
            <Link
              href="/dashboard/documents"
              className="font-semibold underline underline-offset-4 hover:text-midnight"
            >
              Documents
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-2">
            {appliance.documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-midnight/12 bg-white p-3 text-sm"
              >
                <span className="font-medium text-midnight">{document.original_filename}</span>
                <span className="text-xs text-midnight/55">
                  {document.document_type.replace(/_/g, ' ')} ·{' '}
                  {document.status === 'uploaded'
                    ? 'Uploaded'
                    : document.status === 'pending_upload'
                      ? 'Awaiting upload'
                      : 'Upload failed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>
    </>
  );
}
