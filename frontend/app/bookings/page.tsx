import type { Metadata } from 'next';

import { CustomerBookingListPage } from '@/features/bookings/components/CustomerBookingListPage';

export const metadata: Metadata = {
  title: 'My Service Requests',
  description: 'View private FixNear booking requests, statuses and PriceLock decisions.',
};

export default function CustomerBookingsRoute() {
  return <CustomerBookingListPage />;
}
