import type { Metadata } from 'next';

import { WarrantyDetailPage } from '@/features/homepassport/components/WarrantyDetailPage';

export const metadata: Metadata = {
  title: 'Warranty record',
  description: 'Recorded warranty terms, claim eligibility and claim history.',
};

type WarrantyRouteProps = {
  params: Promise<{ warrantyId: string }>;
};

export default async function DashboardWarrantyPage({ params }: WarrantyRouteProps) {
  const { warrantyId } = await params;
  return <WarrantyDetailPage warrantyId={warrantyId} />;
}
