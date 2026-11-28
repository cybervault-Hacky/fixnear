import type { Metadata } from 'next';

import { AdminAuditPage } from '@/features/admin/components/AdminAuditPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Audit Log',
  description:
    'Unified, append-only record of admin decisions and system events across FixNear modules.',
};

export default function AdminAuditRoute() {
  return (
    <AdminShell>
      <AdminAuditPage />
    </AdminShell>
  );
}
