import type { Metadata } from 'next';

import { TechnicianCoveragePage } from '@/features/technician/components/TechnicianCoveragePage';

export const metadata: Metadata = { title: 'Service Coverage' };

export default function TechnicianCoverageRoute() {
  return <TechnicianCoveragePage />;
}
