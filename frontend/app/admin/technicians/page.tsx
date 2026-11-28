import type { Metadata } from 'next';

import { AdminTechnicianReviewPage } from '@/features/admin/components/AdminTechnicianReviewPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Technician Review',
  description: 'Review verification submissions and manage technician account standing.',
};

export default function AdminTechniciansRoute() {
  return (
    <AdminShell>
      <AdminTechnicianReviewPage />
    </AdminShell>
  );
}
