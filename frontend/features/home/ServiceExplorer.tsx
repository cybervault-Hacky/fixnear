'use client';

import { MapPin, Search, Wrench } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { Container } from '@/components/layout/Container';
import { SectionHeading } from '@/components/shared/SectionHeading';
import { Button } from '@/components/ui/Button';
import { HeroVisual } from '@/features/home/HeroVisual';
import { ServiceCategoryCard } from '@/features/home/ServiceCategoryCard';
import { serviceCategories } from '@/features/home/home-data';
import { mapApiServiceToDefinition } from '@/features/services/data/service-api-mapper';
import { listPublicServices } from '@/lib/api/service-catalog';

function categoryMatches(query: string, categoryTitle: string, keywords: readonly string[]) {
  const normalizedQuery = query.toLocaleLowerCase().trim();
  return [categoryTitle, ...keywords].some((term) => {
    const normalizedTerm = term.toLocaleLowerCase();
    return normalizedQuery.includes(normalizedTerm) || normalizedTerm.includes(normalizedQuery);
  });
}

export function ServiceExplorer() {
  const [service, setService] = useState('');
  const [location, setLocation] = useState('');
  const [availableCategories, setAvailableCategories] = useState<typeof serviceCategories>([]);
  const [catalogSource, setCatalogSource] = useState<'api' | 'preview' | 'loading'>('loading');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const reducedMotion = useReducedMotion();
  const serviceInputId = useId();
  const locationInputId = useId();
  const searchNoteId = useId();
  const statusId = useId();

  useEffect(() => {
    let active = true;
    void listPublicServices()
      .then((result) => {
        if (!active) return;
        setAvailableCategories(
          result.map(mapApiServiceToDefinition).map((item) => ({
            title: item.homeTitle,
            description: item.homeDescription,
            keywords: item.keywords,
            icon: item.icon,
          })),
        );
        setCatalogSource('api');
      })
      .catch(() => {
        if (!active) return;
        setAvailableCategories(serviceCategories);
        setCatalogSource('preview');
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleCategories = hasSearched
    ? availableCategories.filter((category) =>
        categoryMatches(submittedQuery, category.title, category.keywords),
      )
    : availableCategories;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedService = service.trim();
    const normalizedLocation = location.trim();

    if (!normalizedService || !normalizedLocation) {
      setStatusMessage('Enter a service and your Pune area to preview a category search.');
      return;
    }
    if (catalogSource === 'loading') {
      setStatusMessage('The service catalog is still loading. Try your search again in a moment.');
      return;
    }

    const matches = availableCategories.filter((category) =>
      categoryMatches(normalizedService, category.title, category.keywords),
    );
    setSubmittedQuery(normalizedService);
    setHasSearched(true);
    setStatusMessage(
      matches.length > 0
        ? `Showing ${matches.length} service ${matches.length === 1 ? 'category' : 'categories'} for “${normalizedService}” near ${normalizedLocation}. This preview does not show technician availability.`
        : catalogSource === 'api'
          ? `No category matches “${normalizedService}” in the active FixNear catalog. Try AC, refrigerator, washing machine, RO, electrical, or plumbing.`
          : `No category matches “${normalizedService}” in the illustrative preview. Try AC, refrigerator, washing machine, RO, electrical, or plumbing.`,
    );
    document.getElementById('services')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const handleCategorySelect = (categoryTitle: string) => {
    setService(categoryTitle);
    setHasSearched(false);
    setStatusMessage(`${categoryTitle} selected. Add your area to preview a local service search.`);
    document.getElementById('home')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    document.getElementById(serviceInputId)?.focus({ preventScroll: true });
  };

  const clearSearch = () => {
    setService('');
    setSubmittedQuery('');
    setHasSearched(false);
    setStatusMessage('Showing all popular service categories.');
  };

  return (
    <>
      <section
        id="home"
        aria-labelledby="hero-title"
        className="scroll-mt-24 overflow-hidden bg-[#f8faf7]"
      >
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.03fr_0.97fr] lg:gap-10 lg:py-24">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10"
          >
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-midnight/10 bg-white px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-midnight/70 shadow-sm sm:text-xs">
              <span aria-hidden="true" className="size-2 rounded-full bg-lime" />A clearer way to
              repair
            </p>
            <h1
              id="hero-title"
              className="max-w-[660px] text-balance text-[2.7rem] font-semibold leading-[1.04] tracking-[-0.065em] text-midnight sm:text-6xl lg:text-[4.55rem]"
            >
              Home repairs.
              <br />
              Without the <span className="text-slate">guesswork.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-midnight/70 sm:text-lg sm:leading-8">
              FixNear is building a more transparent way to manage home repairs: understand the
              estimate, approve changes before work moves ahead, and keep a record of the service.
            </p>

            <form
              id="service-search"
              onSubmit={handleSearch}
              aria-describedby={`${searchNoteId} ${statusId}`}
              className="mt-8 grid gap-3 rounded-2xl border border-midnight/10 bg-white p-3 shadow-[0_18px_48px_rgba(16,24,39,0.08)] sm:grid-cols-2 sm:items-end sm:p-3.5 xl:grid-cols-[1fr_1fr_auto]"
            >
              <label htmlFor={serviceInputId} className="grid min-w-0 gap-1.5 px-1 pt-1 sm:px-2">
                <span className="text-xs font-semibold text-midnight/65">What needs fixing?</span>
                <span className="flex min-h-11 min-w-0 items-center gap-2.5 border-b border-midnight/10 pb-1.5 focus-within:border-midnight/45">
                  <Wrench aria-hidden="true" size={17} className="shrink-0 text-midnight/50" />
                  <input
                    id={serviceInputId}
                    name="service"
                    type="search"
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    placeholder="e.g. AC repair"
                    autoComplete="off"
                    required
                    className="min-w-0 flex-1 bg-transparent text-sm text-midnight outline-none placeholder:text-midnight/45"
                  />
                </span>
              </label>

              <label htmlFor={locationInputId} className="grid min-w-0 gap-1.5 px-1 pt-1 sm:px-2">
                <span className="text-xs font-semibold text-midnight/65">Your area</span>
                <span className="flex min-h-11 min-w-0 items-center gap-2.5 border-b border-midnight/10 pb-1.5 focus-within:border-midnight/45">
                  <MapPin aria-hidden="true" size={17} className="shrink-0 text-midnight/50" />
                  <input
                    id={locationInputId}
                    name="location"
                    type="text"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Pune area or PIN code"
                    autoComplete="address-level2"
                    required
                    className="min-w-0 flex-1 bg-transparent text-sm text-midnight outline-none placeholder:text-midnight/45"
                  />
                </span>
              </label>

              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white transition duration-200 hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none sm:col-span-2 sm:w-full xl:col-span-1 xl:w-auto xl:min-w-[128px]"
              >
                <Search aria-hidden="true" size={17} />
                Search
              </button>
            </form>
            <p id={searchNoteId} className="mt-3 text-xs leading-5 text-midnight/55">
              {catalogSource === 'api'
                ? 'Search uses active database service guides.'
                : catalogSource === 'loading'
                  ? 'Checking the active service catalog…'
                  : 'Search uses illustrative local guide data while the catalog API is disconnected.'}{' '}
              No live technician availability or booking is connected.
            </p>
            <p
              id={statusId}
              role="status"
              aria-live="polite"
              className="mt-1 min-h-5 text-xs leading-5 text-midnight/70"
            >
              {statusMessage}
            </p>
          </motion.div>

          <HeroVisual />
        </Container>
      </section>

      <section
        id="services"
        aria-labelledby="services-title"
        className="scroll-mt-24 bg-white py-16 sm:py-20 lg:py-24"
      >
        <Container>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              id="services-title"
              eyebrow="Start with a service"
              title="Popular home services"
              description="Choose a category to fill the search preview. Matching uses active catalog guide content when available; it does not confirm providers or availability."
            />
            <Button
              href="#how-it-works"
              variant="secondary"
              size="small"
              className="w-fit shrink-0"
            >
              How it works
            </Button>
          </div>

          {hasSearched && (
            <div className="mt-8 flex flex-col gap-3 rounded-xl border border-midnight/10 bg-[#f8faf7] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-midnight/75">{statusMessage}</p>
              <button
                type="button"
                onClick={clearSearch}
                className="min-h-10 w-fit rounded-lg px-3 text-sm font-semibold text-midnight underline decoration-midnight/35 underline-offset-4 transition hover:decoration-midnight focus-visible:outline-2 focus-visible:outline-midnight"
              >
                Show all services
              </button>
            </div>
          )}

          {catalogSource === 'loading' ? (
            <div className="mt-8 rounded-2xl border border-midnight/10 bg-[#f8faf7] px-5 py-10 text-center">
              <p className="font-semibold text-midnight">Loading active service categories…</p>
              <p className="mt-2 text-sm leading-6 text-midnight/65">
                Search and category suggestions will be ready when the catalog responds.
              </p>
            </div>
          ) : visibleCategories.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
              {visibleCategories.map((category) => (
                <div key={category.title} className="min-w-0">
                  <ServiceCategoryCard category={category} onSelect={handleCategorySelect} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-midnight/20 bg-[#f8faf7] px-5 py-10 text-center">
              <p className="font-semibold text-midnight">
                {hasSearched
                  ? 'No matching service category'
                  : catalogSource === 'api'
                    ? 'No active service categories are published yet'
                    : 'No categories are available in this preview'}
              </p>
              <p className="mt-2 text-sm leading-6 text-midnight/65">
                {hasSearched
                  ? 'Try AC, refrigerator, washing machine, RO, electrical, or plumbing.'
                  : 'Check back after active service guides have been added to the catalog.'}
              </p>
              <button
                type="button"
                onClick={clearSearch}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white transition hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
              >
                Browse all services
              </button>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
