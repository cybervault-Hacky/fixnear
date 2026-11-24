import type { Metadata } from 'next';

import { DashboardOverview } from '@/features/dashboard/components/DashboardOverview';

export const metadata: Metadata = {
  title: 'Overview',
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
