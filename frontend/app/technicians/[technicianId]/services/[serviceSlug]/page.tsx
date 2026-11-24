import type { Metadata } from 'next';

import { PublicTechnicianServiceProfilePage } from '@/features/services/components/PublicTechnicianServiceProfilePage';

type PublicTechnicianRouteProps = {
  params: Promise<{ technicianId: string; serviceSlug: string }>;
};

export const metadata: Metadata = {
  title: 'Technician Service Profile',
  description: 'View a public FixNear service profile and its declared service coverage areas.',
};

export default async function PublicTechnicianServiceRoute({ params }: PublicTechnicianRouteProps) {
  const { technicianId, serviceSlug } = await params;
  return (
    <PublicTechnicianServiceProfilePage technicianId={technicianId} serviceSlug={serviceSlug} />
  );
}
