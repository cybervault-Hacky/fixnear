import type { Metadata } from 'next';

import { HomePassportPageContent } from '@/features/homepassport/components/HomePassportPageContent';

export const metadata: Metadata = {
  title: 'HomePassport',
  description:
    'Appliances, service history, parts, documents and reminders linked to your FixNear account.',
};

export default function DashboardHomePassportPage() {
  return <HomePassportPageContent />;
}
