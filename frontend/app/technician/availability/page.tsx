import type { Metadata } from 'next';

import { TechnicianAvailabilityPage } from '@/features/technician/components/TechnicianAvailabilityPage';

export const metadata: Metadata = { title: 'Availability' };

export default function TechnicianAvailabilityRoute() {
  return <TechnicianAvailabilityPage />;
}
