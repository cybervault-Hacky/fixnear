import type { Metadata } from 'next';

import { ActivityPageContent } from '@/features/dashboard/components/ActivityPageContent';

export const metadata: Metadata = {
  title: 'Service Activity',
};

export default function DashboardActivityPage() {
  return <ActivityPageContent />;
}
