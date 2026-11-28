'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, Save } from 'lucide-react';

import {
  applianceCategoryLabels,
  createAppliance,
  rupeesToPaise,
  updateAppliance,
} from '@/lib/api/homepassport';
import type { Appliance, ApplianceCategory, ApplianceInput } from '@/lib/api/homepassport';
import {
  inputClass,
  labelClass,
  messageForPassportError,
  Notice,
  selectClass,
} from './passport-ui';

const CATEGORIES = Object.entries(applianceCategoryLabels) as [ApplianceCategory, string][];

const blankForm = {
  name: '',
  category: 'air_conditioner' as ApplianceCategory,
  brand: '',
  model_number: '',
  serial_number: '',
  purchase_date: '',
  installation_date: '',
  purchase_price_rupees: '',
  seller_name: '',
  notes: '',
};

export function ApplianceForm({
  appliance,
  onSaved,
  onCancel,
}: {
  appliance?: Appliance | null;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appliance) {
      setForm({
        name: appliance.name,
        category: appliance.category,
        brand: appliance.brand,
        model_number: appliance.model_number,
        serial_number: appliance.serial_number ?? '',
        purchase_date: appliance.purchase_date ?? '',
        installation_date: appliance.installation_date ?? '',
        purchase_price_rupees:
          appliance.purchase_price_paise != null
            ? String(appliance.purchase_price_paise / 100)
            : '',
        seller_name: appliance.seller_name ?? '',
        notes: appliance.notes ?? '',
      });
    } else {
      setForm(blankForm);
    }
  }, [appliance]);

  const pricePaise = rupeesToPaise(form.purchase_price_rupees);
  const priceInvalid = form.purchase_price_rupees.trim() !== '' && pricePaise === null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (priceInvalid) {
      setError('Purchase price must be a non-negative amount in rupees.');
      return;
    }
    setSaving(true);
    setError(null);
    const body: ApplianceInput = {
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim(),
      model_number: form.model_number.trim(),
      serial_number: form.serial_number.trim() || null,
      purchase_date: form.purchase_date || null,
      installation_date: form.installation_date || null,
      purchase_price_paise: pricePaise,
      seller_name: form.seller_name.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (appliance) {
        await updateAppliance(appliance.id, body);
      } else {
        await createAppliance(body);
      }
      if (!appliance) setForm(blankForm);
      await onSaved();
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4"
      aria-label={appliance ? 'Edit appliance' : 'Add appliance'}
    >
      {error ? <Notice kind="error">{error}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-name">
            Appliance name *
          </label>
          <input
            id="appliance-name"
            className={inputClass}
            required
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. Living room split AC"
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-category">
            Category *
          </label>
          <select
            id="appliance-category"
            className={selectClass}
            value={form.category}
            onChange={(event) =>
              setForm({ ...form, category: event.target.value as ApplianceCategory })
            }
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-brand">
            Brand *
          </label>
          <input
            id="appliance-brand"
            className={inputClass}
            required
            maxLength={120}
            value={form.brand}
            onChange={(event) => setForm({ ...form, brand: event.target.value })}
            placeholder="e.g. Daikin"
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-model">
            Model number *
          </label>
          <input
            id="appliance-model"
            className={inputClass}
            required
            maxLength={120}
            value={form.model_number}
            onChange={(event) => setForm({ ...form, model_number: event.target.value })}
            placeholder="e.g. FTKF35TV16"
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-serial">
            Serial number <span className="font-normal text-midnight/45">(optional)</span>
          </label>
          <input
            id="appliance-serial"
            className={inputClass}
            maxLength={120}
            autoComplete="off"
            value={form.serial_number}
            onChange={(event) => setForm({ ...form, serial_number: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-price">
            Purchase price (₹, optional)
          </label>
          <input
            id="appliance-price"
            className={inputClass}
            inputMode="decimal"
            value={form.purchase_price_rupees}
            onChange={(event) => setForm({ ...form, purchase_price_rupees: event.target.value })}
            placeholder="e.g. 42500"
            aria-invalid={priceInvalid}
            aria-describedby={priceInvalid ? 'appliance-price-error' : undefined}
          />
          {priceInvalid ? (
            <p id="appliance-price-error" className="text-xs text-[#8d3028]">
              Enter a valid non-negative amount.
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-purchase-date">
            Purchase date <span className="font-normal text-midnight/45">(optional)</span>
          </label>
          <input
            id="appliance-purchase-date"
            type="date"
            className={inputClass}
            value={form.purchase_date}
            onChange={(event) => setForm({ ...form, purchase_date: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelClass} htmlFor="appliance-install-date">
            Installation date <span className="font-normal text-midnight/45">(optional)</span>
          </label>
          <input
            id="appliance-install-date"
            type="date"
            className={inputClass}
            value={form.installation_date}
            onChange={(event) => setForm({ ...form, installation_date: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <label className={labelClass} htmlFor="appliance-seller">
            Seller / store <span className="font-normal text-midnight/45">(optional)</span>
          </label>
          <input
            id="appliance-seller"
            className={inputClass}
            maxLength={160}
            value={form.seller_name}
            onChange={(event) => setForm({ ...form, seller_name: event.target.value })}
            placeholder="e.g. Reliance Digital, FC Road"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <label className={labelClass} htmlFor="appliance-notes">
            Notes <span className="font-normal text-midnight/45">(optional)</span>
          </label>
          <textarea
            id="appliance-notes"
            className={`${inputClass} min-h-24 py-3`}
            maxLength={2000}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || priceInvalid}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50 motion-reduce:transition-none"
        >
          {saving ? (
            <>
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Saving…
            </>
          ) : (
            <>
              <Save size={16} aria-hidden="true" /> {appliance ? 'Save changes' : 'Add appliance'}
            </>
          )}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex min-h-12 items-center rounded-xl border border-midnight/15 bg-white px-5 text-sm font-semibold text-midnight hover:bg-[#f7f9fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
