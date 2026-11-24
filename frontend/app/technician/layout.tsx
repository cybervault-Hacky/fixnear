import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { TechnicianDashboardShell } from '@/features/technician/components/TechnicianDashboardShell';
import { TechnicianDemoProvider } from '@/features/technician/context/TechnicianDemoContext';

export const metadata: Metadata = {
  title: {
    default: 'Technician overview',
    template: '%s | FixNear Technician Demo',
  },
  description:
    'A frontend-only demonstration of a FixNear technician workspace. No real technician account, jobs, or payments are connected.',
};

type TechnicianLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function TechnicianLayout({ children }: TechnicianLayoutProps) {
  return (
    <TechnicianDemoProvider>
      <TechnicianDashboardShell>{children}</TechnicianDashboardShell>
    </TechnicianDemoProvider>
  );
}
