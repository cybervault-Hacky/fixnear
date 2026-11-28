import type { Metadata } from 'next';

import { DocumentsPage } from '@/features/homepassport/components/DocumentsPage';

export const metadata: Metadata = {
  title: 'Documents',
  description: 'Private document vault linked to appliances, warranties, bookings and claims.',
};

export default function DashboardDocumentsPage() {
  return <DocumentsPage />;
}
