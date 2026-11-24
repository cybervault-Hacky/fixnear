import type { Metadata } from 'next';

import { AdminBookingListPage } from '@/features/bookings/components/AdminBookingListPage';

export const metadata: Metadata = {
  title: 'Booking Oversight',
  description: 'Filter and review FixNear bookings with role-protected admin controls.',
};

export default function AdminBookingsRoute() {
  return <AdminBookingListPage />;
}
