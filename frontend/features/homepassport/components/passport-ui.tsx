/* Shared UI helpers for the HomePassport customer and admin surfaces. */
import type { ReactNode } from 'react';
import {
  AirVent,
  CookingPot,
  Droplets,
  Flame,
  House,
  Plug,
  Refrigerator,
  Tv,
  Utensils,
  WashingMachine,
} from 'lucide-react';

import type {
  ApplianceCategory,
  ClaimStatus,
  ServiceHistorySource,
  WarrantyDisplayStatus,
} from '@/lib/api/homepassport';
import {
  claimStatusLabels,
  warrantyStatusLabels,
  warrantyStatusTone,
  claimStatusTone,
} from '@/lib/api/homepassport';

const categoryIcons: Record<ApplianceCategory, typeof House> = {
  air_conditioner: AirVent,
  refrigerator: Refrigerator,
  washing_machine: WashingMachine,
  ro_water_purifier: Droplets,
  television: Tv,
  microwave: CookingPot,
  geyser: Flame,
  dishwasher: Utensils,
  electrical: Plug,
  other: House,
};

const categoryIconStyles: Record<ApplianceCategory, string> = {
  air_conditioner: 'bg-[#e9f2ff] text-[#224b7a]',
  refrigerator: 'bg-[#e8f6ec] text-[#14532d]',
  washing_machine: 'bg-[#eef2ff] text-[#2f3f8f]',
  ro_water_purifier: 'bg-[#e6f7f4] text-[#0f4c5c]',
  television: 'bg-[#f5edf9] text-[#5b3466]',
  microwave: 'bg-[#fff3e0] text-[#8a4b08]',
  geyser: 'bg-[#fff0e8] text-[#8a3b08]',
  dishwasher: 'bg-[#eef6e0] text-[#3f6212]',
  electrical: 'bg-[#fdf3d8] text-[#72510b]',
  other: 'bg-[#f1f3f5] text-midnight/70',
};

export function CategoryIcon({
  category,
  size = 20,
  className = '',
}: {
  category: ApplianceCategory;
  size?: number;
  className?: string;
}) {
  const Icon = categoryIcons[category] ?? House;
  return (
    <span
      aria-hidden="true"
      className={`grid size-11 shrink-0 place-items-center rounded-xl ${categoryIconStyles[category]} ${className}`}
    >
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

export function WarrantyStatusPill({ status }: { status: WarrantyDisplayStatus }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-semibold ${warrantyStatusTone(status)}`}
    >
      {warrantyStatusLabels[status]}
    </span>
  );
}

export function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-semibold ${claimStatusTone(status)}`}
    >
      {claimStatusLabels[status]}
    </span>
  );
}

export function VerificationPill({
  status,
}: {
  status: 'unverified' | 'pending_review' | 'verified';
}) {
  const styles = {
    unverified: 'bg-[#f1f3f5] text-midnight/65',
    pending_review: 'bg-[#fff4d8] text-[#72510b]',
    verified: 'bg-[#e8f6ec] text-[#14532d]',
  } as const;
  const labels = {
    unverified: 'Not verified',
    pending_review: 'Verification pending',
    verified: 'Verified by FixNear support',
  } as const;
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function SourceBadge({ source }: { source: ServiceHistorySource }) {
  return source === 'fixnear_verified' ? (
    <span className="inline-flex min-h-6 items-center rounded-full bg-[#eef7e5] px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight">
      Verified FixNear service
    </span>
  ) : (
    <span className="inline-flex min-h-6 items-center rounded-full bg-[#f1f3f5] px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/60">
      Customer reported · not verified
    </span>
  );
}

export function messageForPassportError(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    const message = 'message' in error ? String((error as { message: unknown }).message) : '';
    if (status === 401) return 'Sign in with an active FixNear account to continue.';
    if (status === 403) return 'This feature requires the customer or admin role.';
    if (status === 404) return 'This record is not available to the signed-in account.';
    if (status === 409)
      return message || 'The record changed elsewhere. Refresh the page and try again.';
    if (status === 422) return message || 'Please check the highlighted fields and try again.';
    if (status === 503)
      return (
        message || 'The FixNear API or a dependency (such as document storage) is not configured.'
      );
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'The FixNear API could not be reached. Please retry.';
}

export function Notice({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-[#e9b8b2] bg-[#fff3f1] text-[#8d3028]',
    success: 'border-[#cbe7ae] bg-[#eef7e5] text-midnight',
    info: 'border-midnight/10 bg-[#f8faf7] text-midnight/65',
  } as const;
  return (
    <p
      role={kind === 'error' ? 'alert' : kind === 'success' ? 'status' : undefined}
      aria-live={kind === 'error' ? undefined : 'polite'}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${styles[kind]}`}
    >
      {children}
    </p>
  );
}

export function LoadingNotice({ label = 'Loading HomePassport…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65"
    >
      {label}
    </div>
  );
}

export function ToggleField({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-midnight/12 bg-white px-3 text-sm font-medium text-midnight focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-midnight"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-midnight"
      />
      {label}
    </label>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight placeholder:text-midnight/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight';
export const labelClass = 'text-xs font-semibold text-midnight/70';
export const selectClass = inputClass;
