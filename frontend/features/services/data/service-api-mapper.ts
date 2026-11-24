import { Wrench } from 'lucide-react';

import { getServiceBySlug } from '@/features/services/data/services';
import type { ServiceDefinition } from '@/features/services/types/service';
import type { ServiceGuide } from '@/lib/api/service-catalog';

export function mapApiServiceToDefinition(service: ServiceGuide): ServiceDefinition {
  const existingPresentation = getServiceBySlug(service.slug);
  return {
    slug: service.slug,
    title: service.title,
    homeTitle: service.home_title,
    homeDescription: service.home_description,
    group: service.category.title,
    description: service.description,
    listingDescription: service.listing_description,
    keywords: service.keywords,
    icon: existingPresentation?.icon ?? Wrench,
    problems: service.common_problems,
    inclusions: service.inspection_scope,
    relatedSlugs: service.related_service_slugs,
    questions: service.questions,
  };
}
