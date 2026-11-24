'use client';

import { useId, useState, type FormEvent } from 'react';
import { MapPin, MapPinned, Plus } from 'lucide-react';

import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import {
  DashboardSelectField,
  DashboardTextField,
} from '@/features/dashboard/components/DashboardFields';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { useDashboardDemo } from '@/features/dashboard/context/DashboardDemoContext';
import type {
  AddressKind,
  DashboardAddress,
  DashboardAddressInput,
} from '@/features/dashboard/types/dashboard';

type AddressDraft = Omit<DashboardAddress, 'id'>;
type AddressErrors = Partial<Record<keyof AddressDraft, string>>;

const addressKinds: readonly AddressKind[] = ['Home', 'Work', 'Other'];

function createBlankAddress(isDefault: boolean): AddressDraft {
  return {
    label: '',
    kind: 'Home',
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    isDefault,
  };
}

function validateAddress(draft: AddressDraft): AddressErrors {
  const errors: AddressErrors = {};
  if (!draft.label.trim()) errors.label = 'Add a short label for this demo address.';
  if (!draft.line1.trim()) errors.line1 = 'Enter a street or building line.';
  if (!draft.city.trim()) errors.city = 'Enter a city or town.';
  if (!draft.region.trim()) errors.region = 'Enter a state or region.';
  if (!/^\d{6}$/.test(draft.postalCode.trim())) {
    errors.postalCode = 'Enter six digits for the sample postal-code format.';
  }
  return errors;
}

export function AddressesPageContent() {
  const { addresses, saveAddress, deleteAddress, setDefaultAddress } = useDashboardDemo();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(() => createBlankAddress(false));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const labelId = useId();
  const kindId = useId();
  const line1Id = useId();
  const line2Id = useId();
  const cityId = useId();
  const regionId = useId();
  const postalCodeId = useId();

  const openNewForm = () => {
    setEditingId(null);
    setDraft(createBlankAddress(addresses.length === 0));
    setErrors({});
    setConfirmDeleteId(null);
    setFeedback('');
    setFormOpen(true);
  };

  const openEditForm = (address: DashboardAddress) => {
    setEditingId(address.id);
    setDraft({
      label: address.label,
      kind: address.kind,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      isDefault: address.isDefault,
    });
    setErrors({});
    setConfirmDeleteId(null);
    setFeedback('');
    setFormOpen(true);
  };

  const updateField = <K extends keyof AddressDraft>(field: K, value: AddressDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFeedback('');
  };

  const cancelForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setErrors({});
    setFeedback('Address changes were cancelled.');
  };

  const saveCurrentAddress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAddress(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback('');
      return;
    }

    const input: DashboardAddressInput = {
      ...draft,
      id: editingId ?? undefined,
      label: draft.label.trim(),
      line1: draft.line1.trim(),
      line2: draft.line2.trim(),
      city: draft.city.trim(),
      region: draft.region.trim(),
      postalCode: draft.postalCode.trim(),
    };
    saveAddress(input);
    setFormOpen(false);
    setEditingId(null);
    setFeedback(`${input.label} saved in this dashboard session only.`);
  };

  const confirmDelete = (address: DashboardAddress) => {
    deleteAddress(address.id);
    setConfirmDeleteId(null);
    setFeedback(`${address.label} was removed from this demo session.`);
  };

  const formTitle = editingId ? 'Edit demo address' : 'Add a demo address';

  return (
    <>
      <DashboardPageHeader
        eyebrow="Addresses · fictional sample entries"
        title="Keep service locations organised."
        description="Manage example Home, Work and Other labels. These fictional placeholders are not real customer addresses and are not stored outside this page session."
        action={
          <DashboardActionButton variant="primary" onClick={openNewForm}>
            <Plus aria-hidden="true" size={16} /> Add demo address
          </DashboardActionButton>
        }
      />

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-midnight"
        >
          {feedback}
        </p>
      ) : null}

      {formOpen ? (
        <DashboardCard
          title={formTitle}
          description="All fields are for demonstration. Enter fictional details only."
          icon={MapPinned}
          className="mb-5"
        >
          <form noValidate onSubmit={saveCurrentAddress} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <DashboardTextField
                id={labelId}
                name="label"
                label="Address label"
                value={draft.label}
                onChange={(event) => updateField('label', event.currentTarget.value)}
                placeholder="e.g. Sample home"
                error={errors.label}
              />
              <DashboardSelectField
                id={kindId}
                name="kind"
                label="Type"
                value={draft.kind}
                onChange={(event) => updateField('kind', event.currentTarget.value as AddressKind)}
                options={addressKinds}
              />
              <DashboardTextField
                id={line1Id}
                name="line1"
                label="Address line 1"
                value={draft.line1}
                onChange={(event) => updateField('line1', event.currentTarget.value)}
                placeholder="Street or building"
                error={errors.line1}
              />
              <DashboardTextField
                id={line2Id}
                name="line2"
                label="Address line 2 (optional)"
                value={draft.line2}
                onChange={(event) => updateField('line2', event.currentTarget.value)}
                placeholder="Fictional area or landmark"
              />
              <DashboardTextField
                id={cityId}
                name="city"
                label="City or town"
                value={draft.city}
                onChange={(event) => updateField('city', event.currentTarget.value)}
                placeholder="Pune"
                error={errors.city}
              />
              <DashboardTextField
                id={regionId}
                name="region"
                label="State or region"
                value={draft.region}
                onChange={(event) => updateField('region', event.currentTarget.value)}
                placeholder="Maharashtra"
                error={errors.region}
              />
              <DashboardTextField
                id={postalCodeId}
                name="postalCode"
                label="Postal code"
                value={draft.postalCode}
                onChange={(event) => updateField('postalCode', event.currentTarget.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="Six digits"
                error={errors.postalCode}
              />
            </div>

            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-midnight/10 bg-[#f8faf7] px-4 py-3 text-sm text-midnight">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(event) => updateField('isDefault', event.currentTarget.checked)}
                className="size-4 accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
              />
              Set as the default demo address
            </label>

            {Object.keys(errors).length > 0 ? (
              <p
                role="alert"
                className="rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
              >
                Review the highlighted fields. A six-digit postal-code format is required.
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-midnight/8 pt-4 sm:flex-row sm:justify-end">
              <DashboardActionButton variant="secondary" onClick={cancelForm}>
                Cancel
              </DashboardActionButton>
              <DashboardActionButton type="submit" variant="primary">
                {editingId ? 'Save address changes' : 'Save address'}
              </DashboardActionButton>
            </div>
          </form>
        </DashboardCard>
      ) : null}

      {addresses.length === 0 ? (
        <DashboardEmptyState
          icon={MapPin}
          title="No demo addresses yet"
          description="Add a fictional placeholder address to preview how saved locations could be organised. Nothing is stored outside this dashboard session."
          action={
            <DashboardActionButton variant="primary" onClick={openNewForm}>
              <Plus aria-hidden="true" size={16} /> Add an address
            </DashboardActionButton>
          }
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              pendingDelete={confirmDeleteId === address.id}
              onEdit={() => openEditForm(address)}
              onSetDefault={() => {
                setDefaultAddress(address.id);
                setFeedback(`${address.label} is now the default demo address.`);
              }}
              onRequestDelete={() => {
                setConfirmDeleteId(address.id);
                setFeedback('');
              }}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onConfirmDelete={() => confirmDelete(address)}
            />
          ))}
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-midnight/50">
        Address validation checks required fields and a six-digit postal-code format only; it does
        not verify that a place exists or can receive service.
      </p>
    </>
  );
}

type AddressCardProps = {
  address: DashboardAddress;
  pendingDelete: boolean;
  onEdit: () => void;
  onSetDefault: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

function AddressCard({
  address,
  pendingDelete,
  onEdit,
  onSetDefault,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: AddressCardProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-midnight/10 bg-white p-5 shadow-[0_8px_30px_rgba(16,24,39,0.03)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-base font-semibold text-midnight">{address.label}</h2>
            <span className="rounded-full bg-[#f1f5ed] px-2.5 py-1 text-[0.65rem] font-semibold text-midnight/65">
              {address.kind}
            </span>
            {address.isDefault ? (
              <span className="rounded-full bg-lime/65 px-2.5 py-1 text-[0.65rem] font-semibold text-midnight">
                Default demo address
              </span>
            ) : null}
          </div>
          <address className="mt-3 break-words text-sm not-italic leading-6 text-midnight/75">
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {address.city}, {address.region} {address.postalCode}
          </address>
          <p className="mt-2 text-xs leading-5 text-midnight/50">
            Fictional sample placeholder · not a real customer address.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f8faf7] text-midnight/60">
          <MapPin aria-hidden="true" size={18} />
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-midnight/8 pt-4">
        <DashboardActionButton
          variant="secondary"
          className="min-h-10 px-3 text-xs"
          aria-label={`Edit ${address.label} address`}
          onClick={onEdit}
        >
          Edit
        </DashboardActionButton>
        {!address.isDefault ? (
          <DashboardActionButton
            variant="quiet"
            className="min-h-10 px-3 text-xs"
            aria-label={`Set ${address.label} as default address`}
            onClick={onSetDefault}
          >
            Make default
          </DashboardActionButton>
        ) : null}
        <DashboardActionButton
          variant="quiet"
          className="min-h-10 px-3 text-xs text-[#943329]"
          aria-label={`Delete ${address.label} address`}
          onClick={onRequestDelete}
        >
          Delete
        </DashboardActionButton>
      </div>

      {pendingDelete ? (
        <div
          role="group"
          aria-label={`Confirm deletion of ${address.label}`}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-[#e9b8b2] bg-[#fff7f5] p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs leading-5 text-[#792b25]">
            Remove {address.label} from this demonstration session?
          </p>
          <div className="flex flex-wrap gap-2">
            <DashboardActionButton
              variant="secondary"
              className="min-h-9 px-3 text-xs"
              aria-label={`Cancel deleting ${address.label}`}
              onClick={onCancelDelete}
            >
              Keep address
            </DashboardActionButton>
            <DashboardActionButton
              variant="danger"
              className="min-h-9 px-3 text-xs"
              aria-label={`Confirm delete ${address.label}`}
              onClick={onConfirmDelete}
            >
              Delete address
            </DashboardActionButton>
          </div>
        </div>
      ) : null}
    </article>
  );
}
