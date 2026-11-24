import { apiRequest, jsonRequest } from '@/lib/api/client';

export type TechnicianVerificationStatus =
  'not_submitted' | 'pending_review' | 'approved' | 'rejected';
export type TechnicianOnboardingStatus = 'incomplete' | 'complete';
export type TechnicianWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type TechnicianProfile = {
  user_id: string;
  display_name: string;
  email: string | null;
  professional_description: string;
  years_experience: number | null;
  onboarding_status: TechnicianOnboardingStatus;
  verification_status: TechnicianVerificationStatus;
  verification_submitted_at: string | null;
  verification_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TechnicianProfileUpdate = {
  display_name?: string;
  professional_description?: string;
  years_experience?: number | null;
};

export type TechnicianSkill = {
  service_id: string;
  service_slug: string;
  title: string;
  is_active: boolean;
  years_experience: number | null;
};

export type TechnicianSkills = { skills: TechnicianSkill[] };
export type TechnicianSkillsUpdate = {
  skills: { service_slug: string; years_experience?: number | null }[];
};

export type TechnicianCoverageArea = {
  id: string;
  area_name: string;
  city: string;
  state: string;
  postal_code: string;
  center_latitude: number | null;
  center_longitude: number | null;
};
export type TechnicianCoverage = { areas: TechnicianCoverageArea[] };
export type TechnicianCoverageUpdate = {
  areas: Omit<TechnicianCoverageArea, 'id'>[];
};

export type AvailabilityDayPreference = {
  available: boolean;
  start: string | null;
  end: string | null;
};
export type WeeklyAvailability = Record<TechnicianWeekday, AvailabilityDayPreference>;
export type TechnicianAvailability = {
  timezone_name: string;
  weekly_schedule: WeeklyAvailability;
};

export type TechnicianOnboarding = {
  onboarding_status: TechnicianOnboardingStatus;
  verification_status: TechnicianVerificationStatus;
  missing_requirements: string[];
};
export type TechnicianVerification = {
  verification_status: TechnicianVerificationStatus;
  onboarding_status: TechnicianOnboardingStatus;
  verification_submitted_at: string | null;
  verification_reviewed_at: string | null;
};

export type AdminVerificationReview = {
  id: string;
  technician_user_id: string;
  reviewer_user_id: string;
  decision: 'approved' | 'rejected';
  note: string | null;
  created_at: string;
};

export type AdminTechnician = {
  user_id: string;
  email: string | null;
  display_name: string;
  professional_description: string;
  years_experience: number | null;
  onboarding_status: TechnicianOnboardingStatus;
  verification_status: TechnicianVerificationStatus;
  verification_submitted_at: string | null;
  verification_reviewed_at: string | null;
  skills: TechnicianSkill[];
  coverage_areas: TechnicianCoverageArea[];
  created_at: string;
  updated_at: string;
};
export type AdminTechnicianDetail = AdminTechnician & { reviews: AdminVerificationReview[] };

export async function getTechnicianProfile() {
  return apiRequest<TechnicianProfile>('technician/profile');
}

export async function updateTechnicianProfile(body: TechnicianProfileUpdate) {
  return apiRequest<TechnicianProfile>('technician/profile', jsonRequest('PATCH', body));
}

export async function getTechnicianSkills() {
  return apiRequest<TechnicianSkills>('technician/services');
}

export async function updateTechnicianSkills(body: TechnicianSkillsUpdate) {
  return apiRequest<TechnicianSkills>('technician/services', jsonRequest('PUT', body));
}

export async function getTechnicianCoverage() {
  return apiRequest<TechnicianCoverage>('technician/coverage');
}

export async function updateTechnicianCoverage(body: TechnicianCoverageUpdate) {
  return apiRequest<TechnicianCoverage>('technician/coverage', jsonRequest('PUT', body));
}

export async function getTechnicianAvailability() {
  return apiRequest<TechnicianAvailability>('technician/availability');
}

export async function updateTechnicianAvailability(body: TechnicianAvailability) {
  return apiRequest<TechnicianAvailability>('technician/availability', jsonRequest('PUT', body));
}

export async function getTechnicianOnboarding() {
  return apiRequest<TechnicianOnboarding>('technician/onboarding');
}

export async function submitTechnicianVerification() {
  return apiRequest<TechnicianVerification>(
    'technician/verification/submit',
    jsonRequest('POST', {}),
  );
}

export async function listAdminTechnicians(verificationStatus?: TechnicianVerificationStatus) {
  const query = verificationStatus
    ? `?${new URLSearchParams({ verification_status: verificationStatus }).toString()}`
    : '';
  return apiRequest<AdminTechnician[]>(`admin/technicians${query}`);
}

export async function getAdminTechnician(userId: string) {
  return apiRequest<AdminTechnicianDetail>(`admin/technicians/${encodeURIComponent(userId)}`);
}

export async function reviewAdminTechnician(
  userId: string,
  body: { decision: 'approved' | 'rejected'; note?: string },
) {
  return apiRequest<AdminVerificationReview>(
    `admin/technicians/${encodeURIComponent(userId)}/verification`,
    jsonRequest('PATCH', body),
  );
}
