import type { Metadata } from 'next';

import { ServiceDetailLoader } from '@/features/services/components/ServiceDetailLoader';
import { getServiceBySlug, services } from '@/features/services/data/services';

type ServiceRouteProps = {
  params: Promise<{ slug: string }>;
};

// Keep the six established service routes statically discoverable while allowing
// newly published catalog slugs to be served by the database-backed detail API.
export const dynamicParams = true;

export function generateStaticParams() {
  return services.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ServiceRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) {
    return {
      title: 'FixNear Service Guide',
      description: 'Browse active home service guides from the FixNear service catalog.',
    };
  }

  return {
    title: `${service.title} Guide`,
    description: service.description,
  };
}

export default async function ServicePage({ params }: ServiceRouteProps) {
  const { slug } = await params;
  return <ServiceDetailLoader slug={slug} />;
}
