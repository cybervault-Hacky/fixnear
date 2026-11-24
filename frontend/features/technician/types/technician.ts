export type TechnicianProfile = {
  fullName: string;
  email: string;
  phone: string;
  professionalDescription: string;
  yearsExperience: string;
};

export type TechnicianServiceId =
  | 'ac-repair'
  | 'refrigerator-repair'
  | 'washing-machine-repair'
  | 'ro-repair'
  | 'electrical-services'
  | 'plumbing-services';

export type TechnicianServiceSkill = {
  id: TechnicianServiceId;
  selected: boolean;
  yearsExperience: string;
};

export type TechnicianDay =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type AvailabilityDay = {
  available: boolean;
  start: string;
  end: string;
};

export type WeeklyAvailability = Record<TechnicianDay, AvailabilityDay>;

export type TechnicianJobStatus = 'Completed' | 'Cancelled';

export type DemoTechnicianJob = {
  id: string;
  reference: string;
  service: string;
  date: string;
  status: TechnicianJobStatus;
  summary: string;
  duration: string;
  sampleAmount?: number;
};

export type DemoEarningsTransaction = {
  id: string;
  date: string;
  month: string;
  service: string;
  reference: string;
  amount: number;
};

export type VerificationStage = {
  id: string;
  title: string;
  status: 'Demo information' | 'Future step' | 'Not available in preview';
  summary: string;
};
