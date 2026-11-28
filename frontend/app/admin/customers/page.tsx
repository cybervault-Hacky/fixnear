import type { Metadata } from 'next';

import { AdminCustomersPage } from '@/features/admin/components/AdminCustomersPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Customers',
  description:
    'Search registered customers, inspect account standing and manage account suspension with audited reasons.',
};

export default function AdminCustomersRoute() {
  return (
    <AdminShell>
      <AdminCustomersPage />
    </AdminShell>
  );
}
