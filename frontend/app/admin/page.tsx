import type { Metadata } from 'next';

import { AdminOverviewPage } from '@/features/admin/components/AdminOverviewPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Overview',
  description: 'Database-backed platform metrics and recent activity for FixNear administrators.',
};

export default function AdminOverviewRoute() {
  return (
    <AdminShell>
      <AdminOverviewPage />
    </AdminShell>
  );
}
