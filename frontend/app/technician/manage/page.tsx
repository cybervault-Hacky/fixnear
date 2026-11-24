import type { Metadata } from 'next';

import { TechnicianApiManagementPage } from '@/features/technician/components/TechnicianApiManagementPage';

export const metadata: Metadata = {
  title: 'Account-backed technician management',
  description:
    'Manage a private technician profile, service skills, coverage areas and weekly preferences through the protected FixNear API.',
};

export default function TechnicianManagePage() {
  return <TechnicianApiManagementPage />;
}
