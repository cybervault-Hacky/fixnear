import type { Metadata } from 'next';

import { AddressesPageContent } from '@/features/dashboard/components/AddressesPageContent';

export const metadata: Metadata = {
  title: 'Saved Addresses',
};

export default function DashboardAddressesPage() {
  return <AddressesPageContent />;
}
