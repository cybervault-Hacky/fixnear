import type { Metadata } from 'next';

import { TechnicianBookingDetailPage } from '@/features/bookings/components/TechnicianBookingDetailPage';

export const metadata: Metadata = {
  title: 'Assigned Booking Details',
  description: 'Review a private technician assignment and prepare an itemized PriceLock quote.',
};

type TechnicianBookingRouteProps = {
  params: Promise<{ bookingId: string }>;
};

export default async function TechnicianBookingRoute({ params }: TechnicianBookingRouteProps) {
  const { bookingId } = await params;
  return <TechnicianBookingDetailPage bookingId={bookingId} />;
}
