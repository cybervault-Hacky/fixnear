import type { Metadata } from 'next';

import { TechnicianEarningsPage } from '@/features/technician/components/TechnicianEarningsPage';

export const metadata: Metadata = { title: 'Earnings Overview' };

export default function TechnicianEarningsRoute() {
  return <TechnicianEarningsPage />;
}
