import type {
  DashboardAddress,
  DemoActivity,
  ProfileDetails,
} from '@/features/dashboard/types/dashboard';

export const DEMO_PROFILE: ProfileDetails = {
  fullName: 'Demo Customer',
  email: 'demo@example.test',
  phone: '',
};

export const DEMO_ADDRESSES: readonly DashboardAddress[] = [
  {
    id: 'demo-home-address',
    label: 'Sample Home',
    kind: 'Home',
    line1: '1 Example Road',
    line2: 'Fictional Block A',
    city: 'Pune',
    region: 'Maharashtra',
    postalCode: '000000',
    isDefault: true,
  },
  {
    id: 'demo-work-address',
    label: 'Sample Work',
    kind: 'Work',
    line1: '99 Demonstration Avenue',
    line2: 'Placeholder Park',
    city: 'Pune',
    region: 'Maharashtra',
    postalCode: '000000',
    isDefault: false,
  },
];

export const DEMO_ACTIVITY: readonly DemoActivity[] = [
  {
    id: 'demo-activity-ac',
    service: 'AC repair',
    date: '2026-10-12',
    status: 'In progress',
    summary: 'Illustrative estimate review for a cooling concern.',
    reference: 'DEMO-AC-014',
    stage: 1,
  },
  {
    id: 'demo-activity-fridge',
    service: 'Refrigerator repair',
    date: '2026-06-18',
    status: 'Completed',
    summary: 'Example service note for an appliance inspection.',
    reference: 'DEMO-FR-008',
    stage: 2,
  },
  {
    id: 'demo-activity-plumbing',
    service: 'Plumbing',
    date: '2025-12-04',
    status: 'Scheduled',
    summary: 'Sample request summary; no appointment is booked.',
    reference: 'DEMO-PL-003',
    stage: 0,
  },
];

export function formatDemoDate(value?: string): string {
  if (!value) return 'Not provided in this demo';

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
