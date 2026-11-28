import type {
  ApplianceCategory,
  ClaimStatus,
  WarrantyDisplayStatus,
  WarrantyType,
} from '@/lib/api/homepassport';

// ---------------------------------------------------------------------------
// Display helpers (pure; unit-tested in tests/homepassport.test.mjs)
// ---------------------------------------------------------------------------

export const applianceCategoryLabels: Record<ApplianceCategory, string> = {
  air_conditioner: 'Air conditioner',
  refrigerator: 'Refrigerator',
  washing_machine: 'Washing machine',
  ro_water_purifier: 'RO / Water purifier',
  television: 'Television',
  microwave: 'Microwave',
  geyser: 'Geyser',
  dishwasher: 'Dishwasher',
  electrical: 'Electrical appliance',
  other: 'Other',
};

export const warrantyTypeLabels: Record<WarrantyType, string> = {
  manufacturer: 'Manufacturer warranty',
  extended: 'Extended warranty',
  service: 'Repair / service warranty',
  part: 'Replacement part warranty',
};

export const claimStatusLabels: Record<ClaimStatus, string> = {
  submitted: 'Submitted',
  additional_information_requested: 'Information requested',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
};

export const warrantyStatusLabels: Record<WarrantyDisplayStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  expired: 'Expired',
  claim_submitted: 'Claim submitted',
  under_review: 'Under review',
  approved: 'Claim approved',
  rejected: 'Claim rejected',
  closed: 'Claim closed',
};

export function warrantyStatusTone(status: WarrantyDisplayStatus): string {
  switch (status) {
    case 'active':
      return 'bg-[#eef7e5] text-midnight';
    case 'upcoming':
      return 'bg-[#eef2ff] text-[#2f3f8f]';
    case 'expired':
      return 'bg-[#f1f3f5] text-midnight/60';
    case 'claim_submitted':
    case 'under_review':
      return 'bg-[#fff4d8] text-[#72510b]';
    case 'approved':
      return 'bg-[#e8f6ec] text-[#14532d]';
    case 'rejected':
      return 'bg-[#fff3f1] text-[#8d3028]';
    case 'closed':
      return 'bg-[#f1f3f5] text-midnight/65';
  }
}

export function claimStatusTone(status: ClaimStatus): string {
  switch (status) {
    case 'submitted':
    case 'under_review':
      return 'bg-[#fff4d8] text-[#72510b]';
    case 'additional_information_requested':
      return 'bg-[#fde8e8] text-[#8d3028]';
    case 'approved':
      return 'bg-[#e8f6ec] text-[#14532d]';
    case 'rejected':
      return 'bg-[#fff3f1] text-[#8d3028]';
    case 'closed':
      return 'bg-[#f1f3f5] text-midnight/65';
  }
}

export function formatPaise(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function bytesToHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
