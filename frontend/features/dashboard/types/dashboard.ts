export type ProfileDetails = {
  fullName: string;
  email: string;
  phone: string;
};

export type AddressKind = 'Home' | 'Work' | 'Other';

export type DashboardAddress = {
  id: string;
  label: string;
  kind: AddressKind;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  isDefault: boolean;
};

export type DashboardAddressInput = Omit<DashboardAddress, 'id'> & { id?: string };

export type ActivityStatus = 'Completed' | 'In progress' | 'Scheduled';

export type DemoActivity = {
  id: string;
  service: string;
  date: string;
  status: ActivityStatus;
  summary: string;
  reference: string;
  stage: number;
};
