import type { Metadata } from 'next';

import { TechnicianOverview } from '@/features/technician/components/TechnicianOverview';

export const metadata: Metadata = {
  title: { absolute: 'Technician Overview | FixNear Technician Demo' },
};

export default function TechnicianPage() {
  return <TechnicianOverview />;
}
