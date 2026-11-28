import { apiRequest, jsonRequest } from '@/lib/api/client';
import { createIdempotentRequest, newIdempotencyKey } from '@/lib/api/bookings';

export type SupportTicketCategory =
  | 'booking_issue'
  | 'technician_issue'
  | 'payment_query'
  | 'warranty_claim'
  | 'repair_quality'
  | 'refund_request'
  | 'account_issue'
  | 'other';

export type SupportTicketStatus =
  'open' | 'assigned' | 'in_progress' | 'waiting_for_customer' | 'resolved' | 'closed';

export type SupportTicketPriority = 'normal' | 'high' | 'urgent';
export type SupportTicketEscalation = 'normal' | 'escalated';

export const ticketCategoryLabels: Record<SupportTicketCategory, string> = {
  booking_issue: 'Booking issue',
  technician_issue: 'Technician issue',
  payment_query: 'Payment-related query',
  warranty_claim: 'Warranty claim',
  repair_quality: 'Repair quality',
  refund_request: 'Refund request',
  account_issue: 'Account issue',
  other: 'Other',
};

export const ticketStatusLabels: Record<SupportTicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  waiting_for_customer: 'Waiting for you',
  resolved: 'Resolved',
  closed: 'Closed',
};

export type SupportTicketSummary = {
  id: string;
  category: SupportTicketCategory;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  escalation_status: SupportTicketEscalation;
  booking_id: string | null;
  technician_user_id: string | null;
  warranty_claim_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: string;
  author_kind: 'customer' | 'staff';
  body: string;
  created_at: string;
};

export type SupportTicketEvent = {
  event_type: string;
  from_status: SupportTicketStatus | null;
  to_status: SupportTicketStatus | null;
  actor_user_id?: string | null;
  created_at: string;
};

export type SupportTicketDetail = SupportTicketSummary & {
  description: string;
  resolved_at: string | null;
  closed_at: string | null;
  messages: SupportMessage[];
  events: SupportTicketEvent[];
};

export type AdminTicketDetail = SupportTicketDetail & {
  customer_user_id: string;
  customer_display_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  internal_notes: {
    id: string;
    author_user_id: string;
    body: string;
    created_at: string;
  }[];
};

export type AdminTicketListItem = SupportTicketSummary & {
  customer_user_id: string;
  customer_display_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
};

export type TicketAssignee = {
  user_id: string;
  label: string;
};

function encode(value: string) {
  return encodeURIComponent(value);
}

export function createTicket(input: {
  category: SupportTicketCategory;
  subject?: string | null;
  description: string;
  booking_id?: string | null;
  warranty_claim_id?: string | null;
}) {
  return apiRequest<SupportTicketDetail>(
    'customer/support/tickets',
    createIdempotentRequest('POST', input, newIdempotencyKey()),
  );
}

export function listMyTickets() {
  return apiRequest<{ items: SupportTicketSummary[]; total: number }>('customer/support/tickets');
}

export function getMyTicket(ticketId: string) {
  return apiRequest<SupportTicketDetail>(`customer/support/tickets/${encode(ticketId)}`);
}

export function addCustomerMessage(ticketId: string, body: string) {
  return apiRequest<SupportTicketDetail>(
    `customer/support/tickets/${encode(ticketId)}/messages`,
    jsonRequest('POST', { body }),
  );
}

// ---------------------------------------------------------------------------
// Admin support desk
// ---------------------------------------------------------------------------

export function listAdminTickets(params: {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  escalated?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.priority) query.set('priority', params.priority);
  if (params.escalated) query.set('escalated', 'true');
  if (params.search) query.set('search', params.search);
  query.set('limit', String(params.limit ?? 25));
  query.set('offset', String(params.offset ?? 0));
  return apiRequest<{ items: AdminTicketListItem[]; total: number }>(
    `admin/support/tickets?${query.toString()}`,
  );
}

export function getAdminTicket(ticketId: string) {
  return apiRequest<AdminTicketDetail>(`admin/support/tickets/${encode(ticketId)}`);
}

export function listAssignees() {
  return apiRequest<{ items: TicketAssignee[] }>('admin/support/assignees');
}

export function assignTicket(ticketId: string, assigneeUserId: string) {
  return apiRequest<AdminTicketDetail>(
    `admin/support/tickets/${encode(ticketId)}/assign`,
    jsonRequest('POST', { assignee_user_id: assigneeUserId }),
  );
}

export function addStaffMessage(ticketId: string, body: string) {
  return apiRequest<AdminTicketDetail>(
    `admin/support/tickets/${encode(ticketId)}/messages`,
    jsonRequest('POST', { body }),
  );
}

export function addInternalNote(ticketId: string, body: string) {
  return apiRequest<{ id: string; author_user_id: string; body: string; created_at: string }>(
    `admin/support/tickets/${encode(ticketId)}/internal-notes`,
    jsonRequest('POST', { body }),
  );
}

export function setTicketStatus(ticketId: string, status: SupportTicketStatus) {
  return apiRequest<AdminTicketDetail>(
    `admin/support/tickets/${encode(ticketId)}/status`,
    jsonRequest('POST', { status }),
  );
}

export function escalateTicket(ticketId: string, reason: string) {
  return apiRequest<AdminTicketDetail>(
    `admin/support/tickets/${encode(ticketId)}/escalate`,
    jsonRequest('POST', { reason }),
  );
}
