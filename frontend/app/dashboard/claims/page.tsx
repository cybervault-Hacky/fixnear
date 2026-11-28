import type { Metadata } from 'next';

import { ClaimsPage } from '@/features/homepassport/components/ClaimsPage';

export const metadata: Metadata = {
  title: 'Warranty Claims',
  description: 'File and track warranty claims with recorded provider decisions.',
};

export default function DashboardClaimsPage() {
  return <ClaimsPage />;
}
