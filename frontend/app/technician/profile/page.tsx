import type { Metadata } from 'next';

import { TechnicianProfilePage } from '@/features/technician/components/TechnicianProfilePage';

export const metadata: Metadata = { title: 'Profile' };

export default function TechnicianProfileRoute() {
  return <TechnicianProfilePage />;
}
