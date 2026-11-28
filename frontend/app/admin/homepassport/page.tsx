import type { Metadata } from 'next';

import { AdminHomePassportPage } from '@/features/homepassport/components/AdminHomePassportPage';

export const metadata: Metadata = {
  title: 'HomePassport Oversight',
  description: 'Review warranty claims, verify warranty records and audit HomePassport changes.',
};

export default function AdminHomePassportRoute() {
  return <AdminHomePassportPage />;
}
