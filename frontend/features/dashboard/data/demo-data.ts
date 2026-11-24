import type {
  DashboardAddress,
  DemoActivity,
  DemoAppliance,
  DemoWarranty,
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

export const DEMO_APPLIANCES: readonly DemoAppliance[] = [
  {
    id: 'demo-appliance-ac',
    name: 'Bedroom cooling unit',
    type: 'Split air conditioner',
    brand: 'ExampleAir',
    location: 'Fictional sample home',
    purchaseDate: '2022-04-15',
    serviceHistory: [
      {
        date: '2026-10-12',
        title: 'Cooling inspection · example',
        detail: 'A demonstration service-history entry, not a real visit.',
      },
      {
        date: '2025-08-09',
        title: 'Seasonal check · example',
        detail: 'Sample maintenance note for the HomePassport preview.',
      },
    ],
    partsHistory: [
      {
        date: '2025-08-09',
        part: 'Air filter · sample replacement',
        detail: 'Illustrative record only; no part was supplied or installed.',
      },
    ],
  },
  {
    id: 'demo-appliance-fridge',
    name: 'Kitchen refrigerator',
    type: 'Refrigerator',
    brand: 'SampleCool',
    location: 'Fictional sample home',
    purchaseDate: '2024-02-01',
    serviceHistory: [
      {
        date: '2026-06-18',
        title: 'Appliance inspection · example',
        detail: 'A sample entry showing where a service note could appear.',
      },
    ],
    partsHistory: [
      {
        date: '2026-06-18',
        part: 'Door seal · example record',
        detail: 'Illustrative replacement record; actual work is not represented.',
      },
    ],
  },
];

export const DEMO_WARRANTIES: readonly DemoWarranty[] = [
  {
    id: 'demo-warranty-active',
    provider: 'Example Provider · fictional',
    coveredItem: 'Split AC repair · sample record',
    startsOn: '2026-05-01',
    expiresOn: '2027-06-30',
    terms:
      'Illustrative entry: terms would be supplied by the responsible provider. This sample does not establish coverage or eligibility.',
  },
  {
    id: 'demo-warranty-expired',
    provider: 'Sample Service Co. · fictional',
    coveredItem: 'Refrigerator part · sample record',
    startsOn: '2024-02-01',
    expiresOn: '2024-05-01',
    terms:
      'Illustrative entry: actual exclusions, duration and claim requirements depend on the responsible provider’s written terms.',
  },
];

export const DEMO_STATUS_AS_OF = '2026-11-22';

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

export function getDemoWarrantyStatus(expiresOn: string): 'active' | 'expired' {
  const expiry = new Date(`${expiresOn}T23:59:59.999Z`).getTime();
  const sampleDate = new Date(`${DEMO_STATUS_AS_OF}T12:00:00.000Z`).getTime();
  return expiry >= sampleDate ? 'active' : 'expired';
}
