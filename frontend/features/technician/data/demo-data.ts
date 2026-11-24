import {
  BadgeCheck,
  CircuitBoard,
  Droplets,
  Fan,
  Refrigerator,
  WashingMachine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type {
  AvailabilityDay,
  DemoEarningsTransaction,
  DemoTechnicianJob,
  TechnicianDay,
  TechnicianProfile,
  TechnicianServiceId,
  TechnicianServiceSkill,
  VerificationStage,
  WeeklyAvailability,
} from '@/features/technician/types/technician';

export type TechnicianServiceCategory = {
  id: TechnicianServiceId;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const TECHNICIAN_SERVICE_CATEGORIES: readonly TechnicianServiceCategory[] = [
  {
    id: 'ac-repair',
    title: 'AC repair',
    description: 'Air-conditioning checks and repair categories shown for this preview.',
    icon: Fan,
  },
  {
    id: 'refrigerator-repair',
    title: 'Refrigerator repair',
    description: 'Refrigeration service categories shown for this preview.',
    icon: Refrigerator,
  },
  {
    id: 'washing-machine-repair',
    title: 'Washing machine repair',
    description: 'Laundry-appliance service categories shown for this preview.',
    icon: WashingMachine,
  },
  {
    id: 'ro-repair',
    title: 'RO repair',
    description: 'Water-purifier service categories shown for this preview.',
    icon: Droplets,
  },
  {
    id: 'electrical-services',
    title: 'Electrical services',
    description: 'General electrical service category shown for this preview.',
    icon: CircuitBoard,
  },
  {
    id: 'plumbing-services',
    title: 'Plumbing services',
    description: 'General plumbing service category shown for this preview.',
    icon: BadgeCheck,
  },
];

export const DEMO_TECHNICIAN_PROFILE: TechnicianProfile = {
  fullName: 'Rohan Sample',
  email: 'rohan@example.test',
  phone: '00000 00000',
  professionalDescription:
    'Fictional profile copy for the FixNear technician dashboard preview. The service categories and experience shown here are sample interface data, not claims about a real person or their qualifications.',
  yearsExperience: '5',
};

export const DEMO_TECHNICIAN_SERVICES: readonly TechnicianServiceSkill[] = [
  { id: 'ac-repair', selected: true, yearsExperience: '5' },
  { id: 'refrigerator-repair', selected: true, yearsExperience: '4' },
  { id: 'washing-machine-repair', selected: true, yearsExperience: '3' },
  { id: 'ro-repair', selected: false, yearsExperience: '' },
  { id: 'electrical-services', selected: false, yearsExperience: '' },
  { id: 'plumbing-services', selected: false, yearsExperience: '' },
];

export const DEMO_COVERAGE_ZONES = [
  'Central Pune cluster',
  'West Pune cluster',
  'East Pune cluster',
  'North Pune cluster',
  'South Pune cluster',
  'PCMC / Northwest cluster',
] as const;

export const DEMO_TECHNICIAN_COVERAGE_AREAS: readonly string[] = [
  'Central Pune cluster',
  'West Pune cluster',
];

export const TECHNICIAN_DAYS: readonly { id: TechnicianDay; label: string; short: string }[] = [
  { id: 'monday', label: 'Monday', short: 'Mon' },
  { id: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { id: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { id: 'thursday', label: 'Thursday', short: 'Thu' },
  { id: 'friday', label: 'Friday', short: 'Fri' },
  { id: 'saturday', label: 'Saturday', short: 'Sat' },
  { id: 'sunday', label: 'Sunday', short: 'Sun' },
];

export const DEMO_WEEKLY_AVAILABILITY: WeeklyAvailability = {
  monday: { available: true, start: '09:00', end: '17:00' },
  tuesday: { available: true, start: '09:00', end: '17:00' },
  wednesday: { available: true, start: '09:00', end: '17:00' },
  thursday: { available: true, start: '09:00', end: '17:00' },
  friday: { available: true, start: '09:00', end: '17:00' },
  saturday: { available: true, start: '10:00', end: '14:00' },
  sunday: { available: false, start: '10:00', end: '14:00' },
};

export const DEMO_TECHNICIAN_JOBS: readonly DemoTechnicianJob[] = [
  {
    id: 'demo-job-ac-021',
    reference: 'DEMO-JOB-021',
    service: 'AC repair',
    date: '2026-11-08',
    status: 'Completed',
    summary:
      'Illustrative cooling-check note. No customer, address, service visit or assignment is represented.',
    duration: 'About 90 minutes · example only',
    sampleAmount: 2450,
  },
  {
    id: 'demo-job-fridge-017',
    reference: 'DEMO-JOB-017',
    service: 'Refrigerator repair',
    date: '2026-10-18',
    status: 'Completed',
    summary:
      'Sample appliance-inspection summary for the work-history layout; it is not a real job record.',
    duration: 'About 75 minutes · example only',
    sampleAmount: 1850,
  },
  {
    id: 'demo-job-washer-014',
    reference: 'DEMO-JOB-014',
    service: 'Washing machine repair',
    date: '2026-09-09',
    status: 'Completed',
    summary:
      'Fictional diagnostic-summary example. No technician or customer interaction occurred.',
    duration: 'About 60 minutes · example only',
    sampleAmount: 1200,
  },
  {
    id: 'demo-job-ro-009',
    reference: 'DEMO-JOB-009',
    service: 'RO repair',
    date: '2026-08-21',
    status: 'Completed',
    summary: 'Illustrative purifier-check summary for the interface preview only.',
    duration: 'About 45 minutes · example only',
    sampleAmount: 950,
  },
  {
    id: 'demo-job-plumbing-004',
    reference: 'DEMO-JOB-004',
    service: 'Plumbing services',
    date: '2026-08-01',
    status: 'Cancelled',
    summary: 'A fictional cancelled-status example. No customer request or booking existed.',
    duration: 'No visit · example only',
  },
];

export const DEMO_EARNINGS_TRANSACTIONS: readonly DemoEarningsTransaction[] = [
  {
    id: 'demo-value-nov',
    date: '2026-11-08',
    month: 'Nov',
    service: 'AC repair',
    reference: 'DEMO-JOB-021',
    amount: 2450,
  },
  {
    id: 'demo-value-oct',
    date: '2026-10-18',
    month: 'Oct',
    service: 'Refrigerator repair',
    reference: 'DEMO-JOB-017',
    amount: 1850,
  },
  {
    id: 'demo-value-sep',
    date: '2026-09-09',
    month: 'Sep',
    service: 'Washing machine repair',
    reference: 'DEMO-JOB-014',
    amount: 1200,
  },
  {
    id: 'demo-value-aug',
    date: '2026-08-21',
    month: 'Aug',
    service: 'RO repair',
    reference: 'DEMO-JOB-009',
    amount: 950,
  },
];

export const DEMO_MONTHLY_VALUES: readonly { month: string; amount: number }[] = [
  { month: 'Jun', amount: 0 },
  { month: 'Jul', amount: 0 },
  { month: 'Aug', amount: 950 },
  { month: 'Sep', amount: 1200 },
  { month: 'Oct', amount: 1850 },
  { month: 'Nov', amount: 2450 },
];

export const DEMO_VERIFICATION_STAGES: readonly VerificationStage[] = [
  {
    id: 'profile-information',
    title: 'Profile information',
    status: 'Demo information',
    summary:
      'Example name and profile fields are present in local UI state; no real account is registered.',
  },
  {
    id: 'skills-information',
    title: 'Skills information',
    status: 'Demo information',
    summary:
      'Sample service categories are selected for layout demonstration only; no skill is verified.',
  },
  {
    id: 'identity-verification',
    title: 'Identity verification',
    status: 'Future step',
    summary:
      'A possible future workflow stage. This preview does not request or store identity details.',
  },
  {
    id: 'document-review',
    title: 'Document review',
    status: 'Future step',
    summary:
      'A possible future review stage. There is no upload control or document collection here.',
  },
  {
    id: 'approval-status',
    title: 'Approval status',
    status: 'Not available in preview',
    summary: 'No approval decision is made or implied by this demonstration dashboard.',
  },
];

export function cloneDemoAvailability(value: WeeklyAvailability): WeeklyAvailability {
  return Object.fromEntries(
    TECHNICIAN_DAYS.map(({ id }) => [id, { ...value[id] } satisfies AvailabilityDay]),
  ) as WeeklyAvailability;
}

export function formatTechnicianDemoDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDemoRupees(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function sumDemoTransactionValues(transactions: readonly DemoEarningsTransaction[]): number {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}
