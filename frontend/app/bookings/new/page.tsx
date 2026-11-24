import type { Metadata } from 'next';

import { CustomerBookingCreatePage } from '@/features/bookings/components/CustomerBookingCreatePage';

export const metadata: Metadata = {
  title: 'Request a Home Service',
  description: 'Submit a private FixNear service request for an active service guide.',
};

type NewBookingRouteProps = {
  searchParams: Promise<{ service?: string | string[] }>;
};

export default async function NewBookingRoute({ searchParams }: NewBookingRouteProps) {
  const { service } = await searchParams;
  return (
    <CustomerBookingCreatePage
      initialServiceSlug={Array.isArray(service) ? (service[0] ?? '') : (service ?? '')}
    />
  );
}
