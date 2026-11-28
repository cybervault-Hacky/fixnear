import type { Metadata } from 'next';

import { WarrantiesPageContent } from '@/features/homepassport/components/WarrantiesPageContent';

export const metadata: Metadata = {
  title: 'Warranties',
  description: 'Manufacturer, extended, service and part warranties with server-computed statuses.',
};

export default function DashboardWarrantiesPage() {
  return <WarrantiesPageContent />;
}
