import type { Metadata } from 'next';

import { CustomerSupportPage } from '@/features/support/components/CustomerSupportPage';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Raise and track FixNear support tickets linked to your account.',
};

export default function DashboardSupportPage() {
  return <CustomerSupportPage />;
}
