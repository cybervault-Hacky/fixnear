import type { Metadata } from 'next';

import { ProfilePageContent } from '@/features/dashboard/components/ProfilePageContent';

export const metadata: Metadata = {
  title: 'Profile',
};

export default function DashboardProfilePage() {
  return <ProfilePageContent />;
}
