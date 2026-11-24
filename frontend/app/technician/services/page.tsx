import type { Metadata } from 'next';

import { TechnicianServicesPage } from '@/features/technician/components/TechnicianServicesPage';

export const metadata: Metadata = { title: 'Services and Skills' };

export default function TechnicianServicesRoute() {
  return <TechnicianServicesPage />;
}
