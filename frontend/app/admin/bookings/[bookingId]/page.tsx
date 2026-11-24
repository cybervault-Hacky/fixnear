import type { Metadata } from 'next';

import { AdminBookingDetailPage } from '@/features/bookings/components/AdminBookingDetailPage';

export const metadata: Metadata = {
  title: 'Admin Booking Details',
  description: 'Review a private FixNear booking, PriceLock history, assignment and audit events.',
};

type AdminBookingRouteProps = {
  params: Promise<{ bookingId: string }>;
};

export default async function AdminBookingRoute({ params }: AdminBookingRouteProps) {
  const { bookingId } = await params;
  return <AdminBookingDetailPage bookingId={bookingId} />;
}
