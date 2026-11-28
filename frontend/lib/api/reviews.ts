import { apiRequest, jsonRequest } from '@/lib/api/client';
import { createIdempotentRequest, newIdempotencyKey } from '@/lib/api/bookings';

export type ReviewStatus = 'published' | 'hidden';

export type Review = {
  id: string;
  booking_id: string;
  technician_user_id: string;
  technician_display_name: string;
  service_slug: string | null;
  rating: number;
  service_quality: number | null;
  professionalism: number | null;
  timeliness: number | null;
  communication: number | null;
  feedback: string;
  status: ReviewStatus;
  customer_label: string;
  edited: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminReview = Review & {
  hidden_reason: string | null;
  hidden_at: string | null;
  report_count: number;
};

export type ReviewInput = {
  rating: number;
  service_quality?: number | null;
  professionalism?: number | null;
  timeliness?: number | null;
  communication?: number | null;
  feedback: string;
};

export type EligibleBooking = {
  booking_id: string;
  service_slug: string;
  preferred_date: string;
  technician_user_id: string;
  technician_display_name: string;
};

export type ReviewReport = {
  id: string;
  review_id: string;
  reporter_user_id: string;
  reason: 'spam' | 'abuse' | 'harassment' | 'privacy' | 'off_topic' | 'fraud' | 'other';
  note: string | null;
  status: 'open' | 'reviewed' | 'dismissed';
  created_at: string;
};

export function listMyReviews() {
  return apiRequest<{ items: Review[]; total: number }>('customer/reviews');
}

export function listEligibleBookings() {
  return apiRequest<{ items: EligibleBooking[] }>('customer/reviews/eligible-bookings');
}

export function createReview(bookingId: string, input: ReviewInput) {
  return apiRequest<Review>(
    `customer/reviews/bookings/${encodeURIComponent(bookingId)}`,
    createIdempotentRequest('POST', input, newIdempotencyKey()),
  );
}

export function updateReview(reviewId: string, input: Partial<ReviewInput>) {
  return apiRequest<Review>(
    `customer/reviews/${encodeURIComponent(reviewId)}`,
    jsonRequest('PATCH', input),
  );
}

export function reportReview(reviewId: string, reason: string, note?: string) {
  return apiRequest<ReviewReport>(
    `customer/reviews/${encodeURIComponent(reviewId)}/report`,
    jsonRequest('POST', { reason, note: note ?? null }),
  );
}

export function listReceivedReviews() {
  return apiRequest<{ items: Review[]; total: number }>('technician/reviews');
}

export function getTechnicianRatingSummary() {
  return apiRequest<{ published_review_count: number; average_rating: number | null }>(
    'technician/reviews/summary',
  );
}

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

export function listAdminReviews(params: {
  status?: 'published' | 'hidden';
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  query.set('limit', String(params.limit ?? 25));
  query.set('offset', String(params.offset ?? 0));
  return apiRequest<{ items: AdminReview[]; total: number }>(`admin/reviews?${query.toString()}`);
}

export function hideReview(reviewId: string, reason: string) {
  return apiRequest<AdminReview>(
    `admin/reviews/${encodeURIComponent(reviewId)}/hide`,
    jsonRequest('POST', { reason }),
  );
}

export function restoreReview(reviewId: string, reason: string) {
  return apiRequest<AdminReview>(
    `admin/reviews/${encodeURIComponent(reviewId)}/restore`,
    jsonRequest('POST', { reason }),
  );
}

export function listReports(params: {
  status?: 'open' | 'reviewed' | 'dismissed';
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  query.set('limit', String(params.limit ?? 25));
  query.set('offset', String(params.offset ?? 0));
  return apiRequest<{ items: ReviewReport[]; total: number }>(
    `admin/reviews/reports?${query.toString()}`,
  );
}

export function resolveReport(reportId: string, status: 'open' | 'reviewed' | 'dismissed') {
  return apiRequest<ReviewReport>(
    `admin/reviews/reports/${encodeURIComponent(reportId)}/resolve`,
    jsonRequest('POST', { status }),
  );
}
