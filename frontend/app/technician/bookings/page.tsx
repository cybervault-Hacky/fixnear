import type { Metadata } from 'next';

import { TechnicianBookingListPage } from '@/features/bookings/components/TechnicianBookingListPage';

export const metadata: Metadata = {
  title: 'Bookings & PriceLock',
  description: 'Review bookings assigned to the authenticated FixNear technician account.',
};

export default function TechnicianBookingsRoute() {
  return <TechnicianBookingListPage />;
}
