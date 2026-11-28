import type { Metadata } from 'next';

import { ApplianceDetailPage } from '@/features/homepassport/components/ApplianceDetailPage';

export const metadata: Metadata = {
  title: 'Appliance record',
  description:
    'Service history, replaced parts, warranties, reminders and documents for one appliance.',
};

type ApplianceRouteProps = {
  params: Promise<{ applianceId: string }>;
};

export default async function DashboardAppliancePage({ params }: ApplianceRouteProps) {
  const { applianceId } = await params;
  return <ApplianceDetailPage applianceId={applianceId} />;
}
