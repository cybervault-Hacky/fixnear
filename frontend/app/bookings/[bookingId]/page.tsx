import type { Metadata } from 'next';

import { CustomerBookingDetailPage } from '@/features/bookings/components/CustomerBookingDetailPage';

export const metadata: Metadata = {
  title: 'Service Request Details',
  description: 'View a private FixNear booking request and its PriceLock quote history.',
};

type CustomerBookingRouteProps = {
  params: Promise<{ bookingId: string }>;
};

export default async function CustomerBookingRoute({ params }: CustomerBookingRouteProps) {
  const { bookingId } = await params;
  return <CustomerBookingDetailPage bookingId={bookingId} />;
}
