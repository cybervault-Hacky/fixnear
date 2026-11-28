import type { Metadata } from 'next';

import { AdminReviewsPage } from '@/features/admin/components/AdminReviewsPage';
import { AdminShell } from '@/features/admin/components/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Review Moderation',
  description:
    'Hide or restore verified customer reviews under documented moderation rules with audited reasons.',
};

export default function AdminReviewsRoute() {
  return (
    <AdminShell>
      <AdminReviewsPage />
    </AdminShell>
  );
}
