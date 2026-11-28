import type { Metadata } from 'next';

import { AdminSupportDeskPage } from '@/features/support/components/AdminSupportDeskPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Support Desk',
  description:
    'Triage customer support tickets: assign staff, reply in-thread, and record internal notes privately.',
};

export default function AdminSupportRoute() {
  return (
    <AdminShell>
      <AdminSupportDeskPage />
    </AdminShell>
  );
}
