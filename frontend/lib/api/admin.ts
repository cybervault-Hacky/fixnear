import { apiRequest, jsonRequest } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type OverviewMetrics = {
  total_customers: number;
  total_technicians: number;
  verified_technicians: number | null;
  pending_technician_verifications: number | null;
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  pending_quotations: number;
  approved_quotations: number;
  open_support_tickets: number;
  average_rating: number | null;
  review_count: number;
};

export type AdminOverview = {
  range_days: number;
  metrics: OverviewMetrics;
  booking_trend: { date: string; count: number }[];
  status_distribution: { status: string; count: number }[];
  category_popularity: { service_slug: string; count: number }[];
  technician_performance: {
    technician_user_id: string;
    display_name: string;
    completed_bookings: number;
    average_rating: number | null;
    review_count: number;
  }[];
  satisfaction_trend: {
    week_start: string;
    average_rating: number | null;
    review_count: number;
  }[];
  recent_activity: {
    source: string;
    actor_label: string | null;
    action: string;
    entity_type: string;
    created_at: string;
  }[];
};

export function getOverview(rangeDays: 7 | 30 | 90 = 30) {
  return apiRequest<AdminOverview>(`admin/overview?days=${rangeDays}`);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type AdminCustomerSummary = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  account_status: 'pending' | 'active' | 'suspended' | 'disabled';
  role_codes: string[];
  created_at: string;
  bookings_total: number;
  last_booking_at: string | null;
};

export type AdminCustomerList = {
  items: AdminCustomerSummary[];
  total: number;
};

export type AdminCustomerDetail = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  phone_e164: string | null;
  account_status: 'pending' | 'active' | 'suspended' | 'disabled';
  role_codes: string[];
  created_at: string;
  bookings_total: number;
  bookings_completed: number;
  bookings_cancelled: number;
  reviews_submitted: number;
  open_tickets: number;
  appliance_count: number;
  warranty_count: number;
  open_warranty_claims: number;
  recent_bookings: {
    id: string;
    service_slug: string;
    status: string;
    preferred_date: string;
    created_at: string;
  }[];
  recent_tickets: {
    id: string;
    category: string;
    subject: string;
    status: string;
    created_at: string;
  }[];
};

export type AdminAccountStatusResult = {
  user_id: string;
  account_status: 'pending' | 'active' | 'suspended' | 'disabled';
  role_codes: string[];
};

export function listCustomers(params: {
  search?: string;
  account_status?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.account_status) query.set('account_status', params.account_status);
  query.set('limit', String(params.limit ?? 25));
  query.set('offset', String(params.offset ?? 0));
  return apiRequest<AdminCustomerList>(`admin/customers?${query.toString()}`);
}

export function getCustomer(userId: string) {
  return apiRequest<AdminCustomerDetail>(`admin/customers/${encode(userId)}`);
}

export function suspendCustomer(userId: string, reason: string) {
  return apiRequest<AdminAccountStatusResult>(
    `admin/customers/${encode(userId)}/suspend`,
    jsonRequest('POST', { reason }),
  );
}

export function reactivateCustomer(userId: string, reason: string) {
  return apiRequest<AdminAccountStatusResult>(
    `admin/customers/${encode(userId)}/reactivate`,
    jsonRequest('POST', { reason }),
  );
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditEntry = {
  id: string | null;
  source: string;
  actor_user_id: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string | null;
  note: string | null;
  is_internal: boolean;
  created_at: string;
};

export type AuditList = {
  items: AuditEntry[];
  total: number;
};

export function listAudit(params: {
  date_from?: string;
  date_to?: string;
  action?: string;
  entity_type?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.date_from) query.set('date_from', params.date_from);
  if (params.date_to) query.set('date_to', params.date_to);
  if (params.action) query.set('action', params.action);
  if (params.entity_type) query.set('entity_type', params.entity_type);
  query.set('limit', String(params.limit ?? 25));
  query.set('offset', String(params.offset ?? 0));
  return apiRequest<AuditList>(`admin/audit?${query.toString()}`);
}

function encode(value: string) {
  return encodeURIComponent(value);
}
