import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DashboardShell } from '@/features/dashboard/components/DashboardShell';
import { DashboardDemoProvider } from '@/features/dashboard/context/DashboardDemoContext';

export const metadata: Metadata = {
  title: {
    default: 'Customer Dashboard',
    template: '%s | FixNear Dashboard',
  },
  description:
    'A local demonstration of the FixNear customer dashboard. No real account or records are connected.',
};

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <DashboardDemoProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardDemoProvider>
  );
}
