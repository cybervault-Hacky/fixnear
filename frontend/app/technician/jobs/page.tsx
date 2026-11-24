import type { Metadata } from 'next';

import { TechnicianJobsPage } from '@/features/technician/components/TechnicianJobsPage';

export const metadata: Metadata = { title: 'Work History' };

export default function TechnicianJobsRoute() {
  return <TechnicianJobsPage />;
}
