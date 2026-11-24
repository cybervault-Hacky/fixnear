import type { Metadata } from 'next';

import { TechnicianVerificationPage } from '@/features/technician/components/TechnicianVerificationPage';

export const metadata: Metadata = { title: 'Verification Stages' };

export default function TechnicianVerificationRoute() {
  return <TechnicianVerificationPage />;
}
