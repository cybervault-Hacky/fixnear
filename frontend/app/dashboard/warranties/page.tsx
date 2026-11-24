import type { Metadata } from 'next';

import { WarrantiesPageContent } from '@/features/dashboard/components/WarrantiesPageContent';

export const metadata: Metadata = {
  title: 'Warranties',
};

export default function DashboardWarrantiesPage() {
  return <WarrantiesPageContent />;
}
