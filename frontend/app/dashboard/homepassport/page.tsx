import type { Metadata } from 'next';

import { HomePassportPageContent } from '@/features/dashboard/components/HomePassportPageContent';

export const metadata: Metadata = {
  title: 'HomePassport',
};

export default function DashboardHomePassportPage() {
  return <HomePassportPageContent />;
}
