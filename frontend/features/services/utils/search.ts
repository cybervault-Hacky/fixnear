import type { ServiceDefinition } from '@/features/services/types/service';

export function normalizeServiceQuery(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function serviceMatchesQuery(service: ServiceDefinition, query: string): boolean {
  const normalizedQuery = normalizeServiceQuery(query);
  if (!normalizedQuery) return true;

  const searchableContent = normalizeServiceQuery(
    [
      service.title,
      service.homeTitle,
      service.group,
      service.description,
      service.listingDescription,
      ...service.keywords,
      ...service.problems.flatMap(({ title, description }) => [title, description]),
    ].join(' '),
  );

  return normalizedQuery.split(' ').every((token) => searchableContent.includes(token));
}
