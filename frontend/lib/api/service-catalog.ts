import { apiRequest, jsonRequest } from '@/lib/api/client';

export type ServiceProblem = {
  title: string;
  description: string;
};

export type ServiceQuestion = {
  question: string;
  answer: string;
};

export type ServiceCategory = {
  id: string;
  slug: string;
  title: string;
  description: string;
  display_order: number;
};

export type AdminServiceCategory = ServiceCategory & {
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceGuide = {
  id: string;
  slug: string;
  title: string;
  home_title: string;
  home_description: string;
  description: string;
  listing_description: string;
  category: ServiceCategory;
  keywords: string[];
  common_problems: ServiceProblem[];
  inspection_scope: string[];
  questions: ServiceQuestion[];
  related_service_slugs: string[];
  display_order: number;
};

export type AdminServiceGuide = ServiceGuide & {
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceCategoryCreate = {
  slug: string;
  title: string;
  description: string;
  display_order: number;
  is_active?: boolean;
};

export type ServiceCategoryUpdate = Partial<ServiceCategoryCreate>;

export type ServiceCreate = {
  category_slug: string;
  slug: string;
  title: string;
  home_title: string;
  home_description: string;
  description: string;
  listing_description: string;
  keywords: string[];
  common_problems: ServiceProblem[];
  inspection_scope: string[];
  questions: ServiceQuestion[];
  related_service_slugs: string[];
  display_order: number;
  is_active?: boolean;
};

export type ServiceUpdate = Partial<ServiceCreate>;

export async function listPublicServiceCategories(): Promise<ServiceCategory[]> {
  return apiRequest('services/categories');
}

export async function listPublicServices(filters: { category?: string; q?: string } = {}) {
  const search = new URLSearchParams();
  if (filters.category) search.set('category', filters.category);
  if (filters.q) search.set('q', filters.q);
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return apiRequest<ServiceGuide[]>(`services${suffix}`);
}

export async function getPublicService(slug: string) {
  return apiRequest<ServiceGuide>(`services/${encodeURIComponent(slug)}`);
}

export async function listAdminServiceCategories() {
  return apiRequest<AdminServiceCategory[]>('admin/service-catalog/categories');
}

export async function createServiceCategory(body: ServiceCategoryCreate) {
  return apiRequest<AdminServiceCategory>(
    'admin/service-catalog/categories',
    jsonRequest('POST', body),
  );
}

export async function updateServiceCategory(id: string, body: ServiceCategoryUpdate) {
  return apiRequest<AdminServiceCategory>(
    `admin/service-catalog/categories/${encodeURIComponent(id)}`,
    jsonRequest('PATCH', body),
  );
}

export async function deactivateServiceCategory(id: string) {
  return apiRequest<void>(`admin/service-catalog/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function listAdminServices() {
  return apiRequest<AdminServiceGuide[]>('admin/service-catalog/services');
}

export async function createService(body: ServiceCreate) {
  return apiRequest<AdminServiceGuide>('admin/service-catalog/services', jsonRequest('POST', body));
}

export async function updateService(id: string, body: ServiceUpdate) {
  return apiRequest<AdminServiceGuide>(
    `admin/service-catalog/services/${encodeURIComponent(id)}`,
    jsonRequest('PATCH', body),
  );
}

export async function deactivateService(id: string) {
  return apiRequest<void>(`admin/service-catalog/services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
