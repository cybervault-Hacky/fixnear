import { apiRequest, jsonRequest } from '@/lib/api/client';

export type BookingStatus =
  | 'requested'
  | 'assigned'
  | 'accepted'
  | 'inspection_pending'
  | 'quote_pending'
  | 'quote_rejected'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type BookingEscalationStatus = 'normal' | 'escalated' | 'resolved';
export type QuoteStatus = 'pending' | 'approved' | 'rejected' | 'superseded' | 'expired';
export type QuoteLineType = 'inspection' | 'labour' | 'part' | 'additional_fee' | 'tax';

export type CustomerAddress = {
  id: string;
  label: string;
  recipient_name: string;
  address_line1: string;
  address_line2: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  contact_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_meters: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerAddressInput = Omit<CustomerAddress, 'id' | 'created_at' | 'updated_at'>;
export type CustomerAddressUpdate = Partial<CustomerAddressInput>;

export type BookingCreateInput = {
  service_slug: string;
  address_id?: string;
  new_address?: CustomerAddressInput;
  save_new_address?: boolean;
  problem_description: string;
  preferred_date: string;
  preferred_start: string;
  preferred_end: string;
  timezone_name: string;
};

export type QuoteLineItem = {
  id: string;
  position: number;
  line_type: QuoteLineType;
  description: string;
  quantity: number;
  unit_amount_paise: number;
  line_total_paise: number;
};

export type BookingQuote = {
  id: string;
  version: number;
  status: QuoteStatus;
  is_current: boolean;
  currency: string;
  total_paise: number;
  technician_notes: string | null;
  issued_at: string;
  expires_at: string;
  is_expired: boolean;
  created_by_user_id: string;
  decision_by_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  line_items: QuoteLineItem[];
};

export type BookingEvent = {
  id: string;
  sequence: number;
  event_type: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  from_status: string | null;
  to_status: string | null;
  reference_id: string | null;
  note: string | null;
  is_internal: boolean;
  created_at: string;
};

export type BookingSummary = {
  id: string;
  service_slug: string;
  service_title: string;
  status: BookingStatus;
  preferred_date: string;
  preferred_start: string;
  preferred_end: string;
  timezone_name: string;
  address_locality: string | null;
  city: string | null;
  assigned_technician_user_id: string | null;
  assigned_technician_name: string | null;
  current_quote_total_paise: number | null;
  current_quote_status: QuoteStatus | null;
  escalation_status: BookingEscalationStatus;
  created_at: string;
  updated_at: string;
  version: number;
};

export type BookingVisitStatus = 'scheduled' | 'en_route' | 'arrived' | 'completed' | 'cancelled';
export type BookingVisit = {
  id: string;
  booking_id: string;
  status: BookingVisitStatus;
  eta_at: string | null;
  eta_source?: 'technician_manual' | 'admin_manual' | null;
  eta_updated_at?: string | null;
  updated_by_user_id: string | null;
  updated_at: string;
  live_tracking_status: 'unavailable';
};

export type BookingDetail = BookingSummary & {
  customer_user_id: string;
  customer_display_name: string | null;
  service_id: string;
  address: Omit<CustomerAddress, 'id' | 'is_default' | 'created_at' | 'updated_at'> | null;
  location_access_limited: boolean;
  problem_description: string;
  cancellation_reason: string | null;
  escalation_reason: string | null;
  visit: BookingVisit | null;
  quotes: BookingQuote[];
  events: BookingEvent[];
};

export type BookingList = { items: BookingSummary[]; total: number };
export type EligibleTechnician = {
  user_id: string;
  display_name: string;
  coverage_area: string;
  years_experience: number | null;
};
export type QuoteDraft = {
  line_type: QuoteLineType;
  description: string;
  quantity: number;
  unit_amount_paise: number;
};
export type QuoteCreateInput = {
  items: QuoteDraft[];
  expires_at: string;
  technician_notes?: string | null;
};

export function createIdempotentRequest(
  method: 'POST' | 'PATCH' | 'PUT',
  body: unknown,
  key: string,
): RequestInit {
  const headers = new Headers({ 'Idempotency-Key': key });
  return { ...jsonRequest(method, body), headers };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function listCustomerAddresses() {
  return apiRequest<CustomerAddress[]>('customer/addresses');
}

export async function createCustomerAddress(body: CustomerAddressInput) {
  return apiRequest<CustomerAddress>('customer/addresses', jsonRequest('POST', body));
}

export async function updateCustomerAddress(id: string, body: CustomerAddressUpdate) {
  return apiRequest<CustomerAddress>(
    `customer/addresses/${encodeURIComponent(id)}`,
    jsonRequest('PATCH', body),
  );
}

export async function deleteCustomerAddress(id: string) {
  return apiRequest<void>(`customer/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type BookingListOptions = { limit?: number; offset?: number };

function bookingListQuery(status: BookingStatus | undefined, options: BookingListOptions = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  return params.size ? `?${params.toString()}` : '';
}

export async function listCustomerBookings(
  status?: BookingStatus,
  options: BookingListOptions = {},
) {
  return apiRequest<BookingList>(`customer/bookings${bookingListQuery(status, options)}`);
}

export async function createCustomerBooking(body: BookingCreateInput, key: string) {
  return apiRequest<BookingDetail>('customer/bookings', createIdempotentRequest('POST', body, key));
}

export async function getCustomerBooking(id: string) {
  return apiRequest<BookingDetail>(`customer/bookings/${encodeURIComponent(id)}`);
}

export async function cancelCustomerBooking(id: string, reason: string, key: string) {
  return apiRequest<BookingDetail>(
    `customer/bookings/${encodeURIComponent(id)}/cancel`,
    createIdempotentRequest('POST', { reason }, key),
  );
}

export async function decideCustomerQuote(
  bookingId: string,
  quoteId: string,
  decision: 'approved' | 'rejected',
  note: string,
  key: string,
) {
  return apiRequest<BookingDetail>(
    `customer/bookings/${encodeURIComponent(bookingId)}/quotes/${encodeURIComponent(quoteId)}/decision`,
    createIdempotentRequest('POST', { decision, note: note || null }, key),
  );
}

export async function listTechnicianBookings(
  status?: BookingStatus,
  options: BookingListOptions = {},
) {
  return apiRequest<BookingList>(`technician/bookings${bookingListQuery(status, options)}`);
}

export async function getTechnicianBooking(id: string) {
  return apiRequest<BookingDetail>(`technician/bookings/${encodeURIComponent(id)}`);
}

export async function respondToAssignment(
  id: string,
  decision: 'accept' | 'decline',
  note: string,
  key: string,
) {
  return apiRequest<{ booking_id: string; decision: 'accept' | 'decline'; status: BookingStatus }>(
    `technician/bookings/${encodeURIComponent(id)}/assignment-decision`,
    createIdempotentRequest('POST', { decision, note: note || null }, key),
  );
}

export async function transitionTechnicianBooking(
  id: string,
  action: 'start_inspection' | 'start_work' | 'complete',
  note: string,
  key: string,
) {
  return apiRequest<BookingDetail>(
    `technician/bookings/${encodeURIComponent(id)}/transitions`,
    createIdempotentRequest('POST', { action, note: note || null }, key),
  );
}

export async function updateTechnicianBookingVisit(
  bookingId: string,
  body: { status: BookingVisitStatus; eta_at: string | null },
  key: string,
) {
  return apiRequest<BookingVisit>(
    `technician/bookings/${encodeURIComponent(bookingId)}/visit`,
    createIdempotentRequest('PUT', body, key),
  );
}

export async function updateAdminBookingVisit(
  bookingId: string,
  body: { status: BookingVisitStatus; eta_at: string | null },
  key: string,
) {
  return apiRequest<BookingVisit>(
    `admin/bookings/${encodeURIComponent(bookingId)}/visit`,
    createIdempotentRequest('PUT', body, key),
  );
}

export async function createTechnicianQuote(id: string, body: QuoteCreateInput, key: string) {
  return apiRequest<BookingDetail>(
    `technician/bookings/${encodeURIComponent(id)}/quotes`,
    createIdempotentRequest('POST', body, key),
  );
}

export type AdminBookingFilters = BookingListOptions & {
  status?: BookingStatus;
  escalation_status?: BookingEscalationStatus;
  service_slug?: string;
  technician_user_id?: string;
  date_from?: string;
  date_to?: string;
};

export async function listAdminBookings(filters: AdminBookingFilters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return apiRequest<BookingList>(`admin/bookings${query.size ? `?${query.toString()}` : ''}`);
}

export async function getAdminBooking(id: string) {
  return apiRequest<BookingDetail>(`admin/bookings/${encodeURIComponent(id)}`);
}

export async function listEligibleTechnicians(id: string) {
  return apiRequest<EligibleTechnician[]>(
    `admin/bookings/${encodeURIComponent(id)}/eligible-technicians`,
  );
}

export async function assignAdminBooking(
  bookingId: string,
  technicianUserId: string,
  note: string,
  key: string,
) {
  return apiRequest<BookingDetail>(
    `admin/bookings/${encodeURIComponent(bookingId)}/assign`,
    createIdempotentRequest(
      'POST',
      { technician_user_id: technicianUserId, note: note || null },
      key,
    ),
  );
}

export async function cancelAdminBooking(id: string, reason: string, key: string) {
  return apiRequest<BookingDetail>(
    `admin/bookings/${encodeURIComponent(id)}/cancel`,
    createIdempotentRequest('POST', { reason }, key),
  );
}

export async function updateAdminBookingEscalation(
  id: string,
  status: 'escalated' | 'resolved',
  reason: string,
  key: string,
) {
  return apiRequest<BookingDetail>(
    `admin/bookings/${encodeURIComponent(id)}/escalation`,
    createIdempotentRequest('PATCH', { status, reason }, key),
  );
}

export async function prepareBookingAttachmentUpload(
  id: string,
  body: { original_filename: string; content_type: string; size_bytes: number },
) {
  return apiRequest<{
    attachment_id: string;
    upload_url: string;
    headers: Record<string, string>;
    expires_at: string;
  }>(
    `customer/bookings/${encodeURIComponent(id)}/attachments/upload-intents`,
    jsonRequest('POST', body),
  );
}
