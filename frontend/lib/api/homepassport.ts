import { apiRequest, jsonRequest } from '@/lib/api/client';
import { createIdempotentRequest, newIdempotencyKey } from '@/lib/api/bookings';

export * from '@/lib/api/homepassport-utils';

export type ApplianceCategory =
  | 'air_conditioner'
  | 'refrigerator'
  | 'washing_machine'
  | 'ro_water_purifier'
  | 'television'
  | 'microwave'
  | 'geyser'
  | 'dishwasher'
  | 'electrical'
  | 'other';

export type ServiceHistorySource = 'fixnear_verified' | 'customer_reported';
export type WarrantyType = 'manufacturer' | 'extended' | 'service' | 'part';
export type VerificationStatus = 'unverified' | 'pending_review' | 'verified';
export type WarrantyDisplayStatus =
  | 'upcoming'
  | 'active'
  | 'expired'
  | 'claim_submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'closed';
export type ClaimStatus =
  | 'submitted'
  | 'additional_information_requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'closed';

export type Appliance = {
  id: string;
  name: string;
  category: ApplianceCategory;
  brand: string;
  model_number: string;
  serial_number: string | null;
  purchase_date: string | null;
  installation_date: string | null;
  purchase_price_paise: number | null;
  seller_name: string | null;
  notes: string | null;
  has_photo: boolean;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplianceInput = {
  name: string;
  category: ApplianceCategory;
  brand: string;
  model_number: string;
  serial_number?: string | null;
  purchase_date?: string | null;
  installation_date?: string | null;
  purchase_price_paise?: number | null;
  seller_name?: string | null;
  notes?: string | null;
};

export type ServiceHistory = {
  id: string;
  appliance_id: string;
  booking_id: string | null;
  source: ServiceHistorySource;
  service_date: string;
  service_category: string;
  booking_reference: string | null;
  technician_name: string | null;
  problem_description: string | null;
  inspection_findings: string | null;
  work_performed: string | null;
  labour_charges_paise: number | null;
  approved_quote_total_paise: number | null;
  completion_status: string;
  customer_feedback: string | null;
  created_at: string;
  updated_at: string;
};

export type ReplacedPart = {
  id: string;
  appliance_id: string;
  service_history_id: string | null;
  booking_id: string | null;
  source: ServiceHistorySource;
  part_name: string;
  part_category: string | null;
  brand: string | null;
  part_number: string | null;
  quantity: number;
  replacement_date: string;
  unit_price_paise: number | null;
  total_price_paise: number | null;
  technician_notes: string | null;
  created_at: string;
};

export type PartInput = {
  part_name: string;
  part_category?: string | null;
  brand?: string | null;
  part_number?: string | null;
  quantity?: number;
  replacement_date: string;
  unit_price_paise?: number | null;
  total_price_paise?: number | null;
  technician_notes?: string | null;
};

export type Warranty = {
  id: string;
  appliance_id: string | null;
  appliance_name: string | null;
  part_id: string | null;
  part_name: string | null;
  booking_id: string | null;
  warranty_type: WarrantyType;
  provider: string;
  reference_number: string | null;
  start_date: string;
  end_date: string;
  terms_summary: string | null;
  verification_status: VerificationStatus;
  status: WarrantyDisplayStatus;
  days_remaining: number;
  claim_eligible: boolean;
  open_claim_id: string | null;
  latest_claim_status: ClaimStatus | null;
  created_at: string;
  updated_at: string;
};

export type WarrantyInput = {
  warranty_type: WarrantyType;
  appliance_id?: string | null;
  part_id?: string | null;
  booking_id?: string | null;
  provider: string;
  reference_number?: string | null;
  start_date: string;
  end_date: string;
  terms_summary?: string | null;
  create_expiry_reminder?: boolean;
};

export type ClaimHistoryEntry = {
  id: string;
  actor_user_id: string | null;
  actor_role: 'customer' | 'admin';
  from_status: ClaimStatus | null;
  to_status: ClaimStatus;
  note: string | null;
  created_at: string;
};

export type WarrantyClaim = {
  id: string;
  warranty_id: string;
  warranty_provider: string;
  warranty_type: WarrantyType;
  appliance_id: string | null;
  appliance_name: string | null;
  customer_user_id: string;
  issue_description: string;
  status: ClaimStatus;
  submitted_at: string;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
  history: ClaimHistoryEntry[];
};

export type ApplianceDocument = {
  id: string;
  appliance_id: string | null;
  warranty_id: string | null;
  claim_id: string | null;
  booking_id: string | null;
  document_type:
    | 'purchase_invoice'
    | 'warranty_certificate'
    | 'repair_report'
    | 'service_invoice'
    | 'parts_receipt'
    | 'photo'
    | 'other';
  original_filename: string;
  content_type: string;
  size_bytes: number;
  status: 'pending_upload' | 'uploaded' | 'failed';
  created_at: string;
};

export type Reminder = {
  id: string;
  appliance_id: string | null;
  warranty_id: string | null;
  reminder_type: string;
  title: string;
  due_date: string;
  timezone_name: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ApplianceDetail = Appliance & {
  service_history: ServiceHistory[];
  parts: ReplacedPart[];
  warranties: Warranty[];
  reminders: Reminder[];
  documents: ApplianceDocument[];
};

export type HomePassportOverview = {
  total_appliances: number;
  active_warranties: number;
  expiring_warranties_30d: number;
  expired_warranties: number;
  open_claims: number;
  recent_service_history: ServiceHistory[];
  recent_parts: ReplacedPart[];
};

export type AdminWarrantySummary = {
  id: string;
  customer_display_name: string | null;
  appliance_name: string | null;
  part_name: string | null;
  warranty_type: WarrantyType;
  provider: string;
  reference_number: string | null;
  start_date: string;
  end_date: string;
  verification_status: VerificationStatus;
  status: WarrantyDisplayStatus;
};

export type AdminAuditEvent = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_fields: string[];
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
};

const encode = (value: string) => encodeURIComponent(value);

// ---------------------------------------------------------------------------
// Customer Overview
// ---------------------------------------------------------------------------

export function getOverview() {
  return apiRequest<HomePassportOverview>('customer/homepassport/overview');
}

// ---------------------------------------------------------------------------
// Appliances
// ---------------------------------------------------------------------------

export function listAppliances(includeArchived = false) {
  const query = includeArchived ? '?include_archived=true' : '';
  return apiRequest<{ items: Appliance[]; total: number }>(
    `customer/homepassport/appliances${query}`,
  );
}

export function createAppliance(body: ApplianceInput) {
  return apiRequest<Appliance>(
    'customer/homepassport/appliances',
    createIdempotentRequest('POST', body, newIdempotencyKey()),
  );
}

export function getAppliance(id: string) {
  return apiRequest<ApplianceDetail>(`customer/homepassport/appliances/${encode(id)}`);
}

export function updateAppliance(id: string, body: Partial<ApplianceInput>) {
  return apiRequest<Appliance>(
    `customer/homepassport/appliances/${encode(id)}`,
    jsonRequest('PATCH', body),
  );
}

export function archiveAppliance(id: string) {
  return apiRequest<Appliance>(`customer/homepassport/appliances/${encode(id)}/archive`, {
    method: 'POST',
  });
}

export function unarchiveAppliance(id: string) {
  return apiRequest<Appliance>(`customer/homepassport/appliances/${encode(id)}/unarchive`, {
    method: 'POST',
  });
}

export function deleteAppliance(id: string) {
  return apiRequest<void>(`customer/homepassport/appliances/${encode(id)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Service history and parts
// ---------------------------------------------------------------------------

export function addCustomerServiceHistory(
  applianceId: string,
  body: {
    service_date: string;
    service_category: string;
    provider_name?: string | null;
    problem_description?: string | null;
    work_performed?: string | null;
    labour_charges_paise?: number | null;
  },
) {
  return apiRequest<ServiceHistory>(
    `customer/homepassport/appliances/${encode(applianceId)}/service-history`,
    createIdempotentRequest('POST', body, newIdempotencyKey()),
  );
}

export function setServiceHistoryFeedback(id: string, customerFeedback: string | null) {
  return apiRequest<ServiceHistory>(
    `customer/homepassport/service-history/${encode(id)}/feedback`,
    jsonRequest('PATCH', { customer_feedback: customerFeedback }),
  );
}

export function deleteServiceHistory(id: string) {
  return apiRequest<void>(`customer/homepassport/service-history/${encode(id)}`, {
    method: 'DELETE',
  });
}

export function addCustomerPart(applianceId: string, body: PartInput) {
  return apiRequest<ReplacedPart>(
    `customer/homepassport/appliances/${encode(applianceId)}/parts`,
    createIdempotentRequest('POST', body, newIdempotencyKey()),
  );
}

export function deletePart(id: string) {
  return apiRequest<void>(`customer/homepassport/parts/${encode(id)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Warranties
// ---------------------------------------------------------------------------

export function listWarranties() {
  return apiRequest<{ items: Warranty[]; total: number }>('customer/homepassport/warranties');
}

export function getWarranty(id: string) {
  return apiRequest<Warranty>(`customer/homepassport/warranties/${encode(id)}`);
}

export function createWarranty(body: WarrantyInput) {
  return apiRequest<Warranty>(
    'customer/homepassport/warranties',
    createIdempotentRequest('POST', body, newIdempotencyKey()),
  );
}

export function updateWarranty(id: string, body: Partial<WarrantyInput>) {
  return apiRequest<Warranty>(
    `customer/homepassport/warranties/${encode(id)}`,
    jsonRequest('PATCH', body),
  );
}

export function fileClaim(warrantyId: string, issueDescription: string) {
  return apiRequest<WarrantyClaim>(
    `customer/homepassport/warranties/${encode(warrantyId)}/claims`,
    createIdempotentRequest('POST', { issue_description: issueDescription }, newIdempotencyKey()),
  );
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export function listClaims() {
  return apiRequest<{ items: WarrantyClaim[]; total: number }>('customer/homepassport/claims');
}

export function getClaim(id: string) {
  return apiRequest<WarrantyClaim>(`customer/homepassport/claims/${encode(id)}`);
}

export function respondToClaim(id: string, note: string) {
  return apiRequest<WarrantyClaim>(
    `customer/homepassport/claims/${encode(id)}/respond`,
    jsonRequest('POST', { note }),
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function listDocuments() {
  return apiRequest<{ items: ApplianceDocument[]; total: number; upload_available: boolean }>(
    'customer/homepassport/documents',
  );
}

export function createDocumentUploadIntent(body: {
  document_type: ApplianceDocument['document_type'];
  original_filename: string;
  content_type: string;
  size_bytes: number;
  appliance_id?: string | null;
  warranty_id?: string | null;
  claim_id?: string | null;
  booking_id?: string | null;
}) {
  return apiRequest<{
    document_id: string;
    upload_url: string;
    headers: Record<string, string>;
    expires_at: string;
  }>('customer/homepassport/documents/upload-intents', jsonRequest('POST', body));
}

export function deleteDocument(id: string) {
  return apiRequest<void>(`customer/homepassport/documents/${encode(id)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export function listReminders(enabled?: boolean) {
  const query = enabled === undefined ? '' : `?enabled=${enabled ? 'true' : 'false'}`;
  return apiRequest<{ items: Reminder[]; total: number }>(
    `customer/homepassport/reminders${query}`,
  );
}

export function createReminder(body: {
  reminder_type: 'scheduled_maintenance' | 'custom';
  title: string;
  due_date: string;
  timezone_name?: string;
  appliance_id?: string | null;
}) {
  return apiRequest<Reminder>(
    'customer/homepassport/reminders',
    createIdempotentRequest('POST', body, newIdempotencyKey()),
  );
}

export function updateReminder(
  id: string,
  body: { title?: string; due_date?: string; is_enabled?: boolean },
) {
  return apiRequest<Reminder>(
    `customer/homepassport/reminders/${encode(id)}`,
    jsonRequest('PATCH', body),
  );
}

export function deleteReminder(id: string) {
  return apiRequest<void>(`customer/homepassport/reminders/${encode(id)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Admin oversight
// ---------------------------------------------------------------------------

export function listAdminClaims(status?: ClaimStatus, limit = 25, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set('status', status);
  return apiRequest<{ items: WarrantyClaim[]; total: number }>(
    `admin/homepassport/claims?${params.toString()}`,
  );
}

export function getAdminClaim(id: string) {
  return apiRequest<WarrantyClaim>(`admin/homepassport/claims/${encode(id)}`);
}

export function listAdminClaimDocuments(id: string) {
  return apiRequest<{ items: ApplianceDocument[]; total: number; upload_available: boolean }>(
    `admin/homepassport/claims/${encode(id)}/documents`,
  );
}

export function transitionClaim(
  id: string,
  action: 'start_review' | 'request_information' | 'approve' | 'reject' | 'close',
  note?: string,
) {
  return apiRequest<WarrantyClaim>(
    `admin/homepassport/claims/${encode(id)}/transitions`,
    jsonRequest('POST', { action, note: note ?? null }),
  );
}

export function listAdminWarranties(
  verificationStatus?: VerificationStatus,
  limit = 25,
  offset = 0,
) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (verificationStatus) params.set('verification_status', verificationStatus);
  return apiRequest<{ items: AdminWarrantySummary[]; total: number }>(
    `admin/homepassport/warranties?${params.toString()}`,
  );
}

export function setWarrantyVerification(
  id: string,
  verificationStatus: VerificationStatus,
  note: string,
) {
  return apiRequest<{ verification_status: VerificationStatus }>(
    `admin/homepassport/warranties/${encode(id)}/verification`,
    jsonRequest('PATCH', { verification_status: verificationStatus, note }),
  );
}

export function listAdminAuditEvents(entityType?: string, limit = 25, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (entityType) params.set('entity_type', entityType);
  return apiRequest<{ items: AdminAuditEvent[]; total: number }>(
    `admin/homepassport/audit?${params.toString()}`,
  );
}
