'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/navigation/Navbar';
import { ServiceDetailPage } from '@/features/services/components/ServiceDetailPage';
import { getServiceBySlug, services } from '@/features/services/data/services';
import { mapApiServiceToDefinition } from '@/features/services/data/service-api-mapper';
import { FixNearApiError } from '@/lib/api/client';
import { getPublicService, listPublicServices } from '@/lib/api/service-catalog';
import type { ServiceDefinition } from '@/features/services/types/service';

type ServiceDetailLoaderProps = {
  slug: string;
};

type LoaderState = {
  service: ServiceDefinition | null;
  catalog: readonly ServiceDefinition[];
  source: 'api' | 'preview';
  loading: boolean;
  unavailable: boolean;
};

function GuideMessage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main
        id="main-content"
        className="mx-auto min-h-[60vh] w-full max-w-3xl px-4 py-20 text-midnight sm:px-6"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-midnight/50">
          Service guide
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-midnight/65">{description}</p>
        <Link
          href="/services"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
        >
          Browse service guides
        </Link>
      </main>
      <Footer />
    </>
  );
}

export function ServiceDetailLoader({ slug }: ServiceDetailLoaderProps) {
  const fallbackService = getServiceBySlug(slug) ?? null;
  const [state, setState] = useState<LoaderState>(() => ({
    service: fallbackService,
    catalog: services,
    source: 'preview',
    loading: !fallbackService,
    unavailable: false,
  }));

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const apiService = await getPublicService(slug);
        const mappedService = mapApiServiceToDefinition(apiService);
        let mappedCatalog: ServiceDefinition[] = [mappedService];
        try {
          mappedCatalog = (await listPublicServices()).map(mapApiServiceToDefinition);
        } catch {
          // Keep the guide response useful if the list endpoint is temporarily unavailable.
        }
        if (!active) return;
        setState({
          service: mappedService,
          catalog: mappedCatalog,
          source: 'api',
          loading: false,
          unavailable: false,
        });
      } catch (error) {
        if (!active) return;
        if (error instanceof FixNearApiError && error.status === 404) {
          setState({
            service: null,
            catalog: [],
            source: 'preview',
            loading: false,
            unavailable: false,
          });
          return;
        }
        setState((current) => ({
          ...current,
          loading: false,
          unavailable: !current.service,
        }));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.service) {
    return (
      <ServiceDetailPage
        service={state.service}
        catalogServices={state.catalog}
        catalogSource={state.source}
      />
    );
  }
  if (state.loading) {
    return (
      <GuideMessage
        title="Loading service guide…"
        description="Checking the published service catalog."
      />
    );
  }
  if (state.unavailable) {
    return (
      <GuideMessage
        title="Service catalog unavailable"
        description="This guide is not part of the local preview, and the database catalog could not be reached. Please try again later."
      />
    );
  }
  return (
    <GuideMessage
      title="Service guide not found"
      description="This service guide is not currently published in the active FixNear catalog."
    />
  );
}
