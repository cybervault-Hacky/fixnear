import type { Metadata } from 'next';

import { AdminServiceCatalogPage } from '@/features/admin/components/AdminServiceCatalogPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Service Catalog',
  description: 'Manage database-backed FixNear service categories and guide content.',
};

export default function AdminServiceCatalogRoute() {
  return (
    <AdminShell>
      <AdminServiceCatalogPage />
    </AdminShell>
  );
}
