import { apiRequest, jsonRequest } from '@/lib/api/client';

export type NearbyTechnician = {
  user_id: string;
  display_name: string;
  professional_description: string;
  years_experience: number | null;
  service_slug: string;
  service_title: string;
  verification_approved: true;
  coverage_area: string;
  coverage_city: string;
  coverage_state: string;
  coverage_postal_code: string;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  distance_basis: 'approximate_service_area_center' | null;
};

export type NearbyTechnicianList = {
  service_slug: string;
  results: NearbyTechnician[];
  total: number;
  limit: number;
  offset: number;
  sort: 'distance' | 'service_area';
  location_mode: 'coordinates' | 'manual_area';
  note: string;
};

export type NearbyLocationSearch =
  | {
      limit?: number;
      offset?: number;
      mode: 'coordinates';
      latitude: number;
      longitude: number;
      radius_km: number;
    }
  | {
      limit?: number;
      offset?: number;
      mode: 'manual_area';
      area?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };

export type PublicTechnicianServiceProfile = {
  user_id: string;
  display_name: string;
  professional_description: string;
  years_experience: number | null;
  verification_approved: true;
  service_slug: string;
  service_title: string;
  service_description: string;
  coverage_areas: {
    area_name: string;
    city: string;
    state: string;
    postal_code: string;
    latitude: number | null;
    longitude: number | null;
  }[];
  note: string;
};

export async function findNearbyTechnicians(serviceSlug: string, location: NearbyLocationSearch) {
  const body =
    location.mode === 'coordinates'
      ? location
      : {
          mode: location.mode,
          ...(location.limit !== undefined ? { limit: location.limit } : {}),
          ...(location.offset !== undefined ? { offset: location.offset } : {}),
          ...(location.area?.trim() ? { area: location.area.trim() } : {}),
          ...(location.city?.trim() ? { city: location.city.trim() } : {}),
          ...(location.state?.trim() ? { state: location.state.trim() } : {}),
          ...(location.postal_code?.trim() ? { postal_code: location.postal_code.trim() } : {}),
        };
  return apiRequest<NearbyTechnicianList>(
    `services/${encodeURIComponent(serviceSlug)}/nearby-technicians/search`,
    jsonRequest('POST', body),
  );
}

export async function getPublicTechnicianServiceProfile(technicianId: string, serviceSlug: string) {
  return apiRequest<PublicTechnicianServiceProfile>(
    `technicians/${encodeURIComponent(technicianId)}/services/${encodeURIComponent(serviceSlug)}`,
  );
}
