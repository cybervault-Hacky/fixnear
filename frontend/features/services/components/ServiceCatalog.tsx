'use client';

import { FilterX, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useMemo, useState } from 'react';

import { Container } from '@/components/layout/Container';
import { Reveal } from '@/components/shared/Reveal';
import { ServiceCard } from '@/features/services/components/ServiceCard';
import { mapApiServiceToDefinition } from '@/features/services/data/service-api-mapper';
import { services } from '@/features/services/data/services';
import type { ServiceGroup } from '@/features/services/types/service';
import { listPublicServices } from '@/lib/api/service-catalog';
import { serviceMatchesQuery } from '@/features/services/utils/search';

const allServicesFilter = 'all' as const;

export function ServiceCatalog() {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<ServiceGroup | typeof allServicesFilter>(
    allServicesFilter,
  );
  const [catalogServices, setCatalogServices] = useState<typeof services>([]);
  const [catalogSource, setCatalogSource] = useState<'api' | 'preview' | 'loading'>('loading');
  const queryInputId = useId();
  const resultsStatusId = useId();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    void listPublicServices()
      .then((result) => {
        if (!active) return;
        setCatalogServices(result.map(mapApiServiceToDefinition));
        setCatalogSource('api');
      })
      .catch(() => {
        if (!active) return;
        setCatalogServices(services);
        setCatalogSource('preview');
      });
    return () => {
      active = false;
    };
  }, []);

  const serviceGroups = useMemo(
    () => [...new Set(catalogServices.map((service) => service.group))],
    [catalogServices],
  );

  const filteredServices = useMemo(
    () =>
      catalogServices.filter(
        (service) =>
          (activeGroup === allServicesFilter || service.group === activeGroup) &&
          serviceMatchesQuery(service, query),
      ),
    [activeGroup, catalogServices, query],
  );

  const filtersAreActive = query.trim().length > 0 || activeGroup !== allServicesFilter;
  const clearFilters = () => {
    setQuery('');
    setActiveGroup(allServicesFilter);
  };

  return (
    <main id="main-content">
      <section aria-labelledby="services-title" className="overflow-hidden bg-[#f8faf7]">
        <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:py-24">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-midnight/10 bg-white px-3.5 py-2 text-xs font-semibold text-midnight/65 shadow-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
              {catalogSource === 'api'
                ? 'Service discovery · active catalog'
                : catalogSource === 'loading'
                  ? 'Service discovery · loading catalog'
                  : 'Service discovery · illustrative guides'}
            </div>
            <h1
              id="services-title"
              className="mt-6 max-w-3xl text-balance text-[2.7rem] font-semibold leading-[1.04] tracking-[-0.065em] text-midnight sm:text-6xl lg:text-[4.3rem]"
            >
              Find a clearer path to a home repair.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-midnight/70 sm:text-lg sm:leading-8">
              Browse practical service guides, search by a symptom, and learn what an itemised
              repair conversation can cover—before deciding what to do next.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-midnight/55">
              These guides are general information, not a diagnosis or confirmation that a provider,
              appointment or price is available.
            </p>
          </Reveal>

          <div className="relative mx-auto w-full max-w-[460px] lg:justify-self-end">
            <div
              aria-hidden="true"
              className="absolute -inset-5 rounded-[2rem] bg-lime/20 blur-2xl"
            />
            <div className="relative rounded-[1.75rem] border border-midnight/10 bg-white p-5 shadow-[0_24px_60px_rgba(16,24,39,0.08)] sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-midnight text-lime">
                  <Search aria-hidden="true" size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-midnight">
                    Search services and symptoms
                  </p>
                  <p className="mt-1 text-xs leading-5 text-midnight/55">
                    For example: “water leaking”
                  </p>
                </div>
              </div>
              <label htmlFor={queryInputId} className="sr-only">
                Search by service or common problem
              </label>
              <div className="mt-5 flex min-h-12 items-center gap-3 rounded-xl border border-midnight/15 bg-[#f8faf7] px-3.5 focus-within:border-midnight/45 focus-within:ring-2 focus-within:ring-lime/55">
                <Search aria-hidden="true" size={17} className="shrink-0 text-midnight/45" />
                <input
                  id={queryInputId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try “not cooling” or “leaking tap”"
                  aria-describedby={resultsStatusId}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-midnight outline-none placeholder:text-midnight/45"
                />
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="catalog-heading" className="bg-white py-14 sm:py-18 lg:py-20">
        <Container>
          <div className="flex flex-col gap-5 border-b border-midnight/8 pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-midnight/55">
                <SlidersHorizontal aria-hidden="true" size={14} />
                Explore by category
              </p>
              <h2
                id="catalog-heading"
                className="text-balance text-2xl font-semibold tracking-[-0.04em] text-midnight sm:text-3xl"
              >
                Home service guides
              </h2>
              <p className="mt-2 text-xs text-midnight/50">
                {catalogSource === 'api'
                  ? 'Connected to the active FixNear service catalog.'
                  : catalogSource === 'loading'
                    ? 'Checking the active database catalog…'
                    : 'Illustrative local guides · database catalog not connected.'}
              </p>
            </div>
            {filtersAreActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-3 text-sm font-semibold text-midnight/75 underline decoration-midnight/25 underline-offset-4 transition hover:text-midnight hover:decoration-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
              >
                <FilterX aria-hidden="true" size={16} />
                Clear filters
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Filter services by category"
            className="mt-6 flex flex-wrap gap-2"
          >
            <button
              type="button"
              aria-pressed={activeGroup === allServicesFilter}
              onClick={() => setActiveGroup(allServicesFilter)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none ${activeGroup === allServicesFilter ? 'border-midnight bg-midnight text-white' : 'border-midnight/12 bg-white text-midnight/70 hover:border-midnight/30 hover:text-midnight'}`}
            >
              All services
            </button>
            {serviceGroups.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={activeGroup === group}
                onClick={() => setActiveGroup(group)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none ${activeGroup === group ? 'border-midnight bg-midnight text-white' : 'border-midnight/12 bg-white text-midnight/70 hover:border-midnight/30 hover:text-midnight'}`}
              >
                {group}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              id={resultsStatusId}
              role="status"
              aria-live="polite"
              className="text-sm text-midnight/60"
            >
              {catalogSource === 'loading'
                ? 'Loading active service guides…'
                : `Showing ${filteredServices.length} of ${catalogServices.length} service guides${query.trim() ? ` for “${query.trim()}”` : ''}.`}
            </p>
            <p className="text-xs leading-5 text-midnight/45">
              {catalogSource === 'api'
                ? 'Filter and search results use published database guide content.'
                : catalogSource === 'loading'
                  ? 'Loading published catalog content.'
                  : 'Filter and search results use illustrative local guide content only.'}
            </p>
          </div>

          {catalogSource === 'loading' ? (
            <div className="mt-6 rounded-2xl border border-midnight/10 bg-[#f8faf7] px-5 py-12 text-center text-sm text-midnight/55">
              Checking the active service catalog…
            </div>
          ) : filteredServices.length > 0 ? (
            <motion.div
              layout={!reducedMotion}
              className="mt-6 grid items-stretch gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {filteredServices.map((service) => (
                  <ServiceCard key={service.slug} serviceSlug={service.slug} service={service} />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              layout={!reducedMotion}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              className="mt-6 rounded-2xl border border-dashed border-midnight/20 bg-[#f8faf7] px-5 py-12 text-center sm:px-8"
            >
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-midnight/70 shadow-sm">
                <Search aria-hidden="true" size={20} />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-midnight">
                {filtersAreActive
                  ? 'No matching service guides'
                  : 'No service guides are published yet'}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-midnight/65">
                {filtersAreActive
                  ? 'Try a service name or a shorter symptom, such as “not cooling”, “drain”, “flickering” or “low water flow”.'
                  : 'An administrator can publish descriptive guide content to the active catalog. No price or availability data is shown here.'}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white transition hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none"
              >
                <FilterX aria-hidden="true" size={16} />
                Clear search and filters
              </button>
            </motion.div>
          )}
        </Container>
      </section>

      <section className="border-t border-midnight/8 bg-[#f8faf7] py-10 sm:py-12">
        <Container className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-midnight">Looking for a particular repair?</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-midnight/65">
              Search the symptom or choose a category above. If a problem may be urgent or unsafe,
              follow the appliance guidance and appropriate local safety advice.
            </p>
          </div>
          <Link
            href="/#how-it-works"
            className="inline-flex min-h-11 w-fit shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-midnight underline decoration-midnight/25 underline-offset-4 transition hover:decoration-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
          >
            How FixNear is designed to work
          </Link>
        </Container>
      </section>
    </main>
  );
}
