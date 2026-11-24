import {
  ArrowRight,
  Check,
  ClipboardList,
  FileCheck2,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/layout/Container';
import { Navbar } from '@/components/navigation/Navbar';
import { Reveal } from '@/components/shared/Reveal';
import { SectionHeading } from '@/components/shared/SectionHeading';
import { Button } from '@/components/ui/Button';
import { ServiceCard } from '@/features/services/components/ServiceCard';
import { ServiceFaq } from '@/features/services/components/ServiceFaq';
import { ServiceIllustration } from '@/features/services/components/ServiceIllustration';
import { ServiceProblems } from '@/features/services/components/ServiceProblems';
import { NearbyTechnicianDiscovery } from '@/features/services/components/NearbyTechnicianDiscovery';
import { getRelatedServices } from '@/features/services/data/services';
import { howItWorksSteps } from '@/features/home/home-data';
import type { ServiceDefinition } from '@/features/services/types/service';

type ServiceDetailPageProps = {
  service: ServiceDefinition;
  catalogServices?: readonly ServiceDefinition[];
  catalogSource?: 'api' | 'preview';
};

const estimateParts = [
  {
    title: 'Inspection and diagnosis',
    description:
      'Describe what is included in the visit and what the inspection can—and cannot—confirm.',
    icon: ClipboardList,
  },
  {
    title: 'Labour',
    description:
      'Show the proposed work separately so the customer can understand what the labour covers.',
    icon: FileCheck2,
  },
  {
    title: 'Parts and materials',
    description:
      'Identify proposed components or materials and list their applicable charges separately.',
    icon: ReceiptText,
  },
  {
    title: 'Other applicable charges',
    description:
      'Explain any additional fee or charge before work begins; this guide does not quote an amount.',
    icon: Check,
  },
] as const;

export function ServiceDetailPage({
  service,
  catalogServices,
  catalogSource = 'preview',
}: ServiceDetailPageProps) {
  const relatedServices = getRelatedServices(service, catalogServices);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content">
        <section aria-labelledby="service-title" className="overflow-hidden bg-[#f8faf7]">
          <Container className="grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[0.98fr_1.02fr] lg:gap-12 lg:py-20">
            <Reveal>
              <nav aria-label="Breadcrumb" className="mb-7 text-sm text-midnight/55">
                <ol className="flex flex-wrap items-center gap-2">
                  <li>
                    <Link
                      href="/#home"
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2"
                    >
                      Home
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li>
                    <Link
                      href="/services"
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2"
                    >
                      Services
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="font-medium text-midnight/80">
                    {service.title}
                  </li>
                </ol>
              </nav>

              <p className="inline-flex items-center gap-2 rounded-full border border-midnight/10 bg-white px-3.5 py-2 text-xs font-semibold text-midnight/65 shadow-sm">
                <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
                {service.group} · service guide
              </p>
              <h1
                id="service-title"
                className="mt-6 max-w-[670px] text-balance text-[2.7rem] font-semibold leading-[1.04] tracking-[-0.065em] text-midnight sm:text-6xl lg:text-[4.2rem]"
              >
                {service.title}, explained clearly.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-midnight/70 sm:text-lg sm:leading-8">
                {service.description}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {catalogSource === 'api' ? (
                  <Button
                    href={`/bookings/new?service=${encodeURIComponent(service.slug)}`}
                    size="medium"
                  >
                    Request this service <ArrowRight aria-hidden="true" size={17} />
                  </Button>
                ) : null}
                <Button
                  href="#common-problems"
                  variant={catalogSource === 'api' ? 'secondary' : 'primary'}
                  size="medium"
                >
                  Explore common problems <ArrowRight aria-hidden="true" size={17} />
                </Button>
                <Button href="/services" variant="secondary" size="medium">
                  All service guides
                </Button>
              </div>
              <p className="mt-4 max-w-xl text-xs leading-5 text-midnight/55">
                {catalogSource === 'api'
                  ? 'Guide content is served from the FixNear service catalog.'
                  : 'Illustrative local guide · database catalog not connected.'}
              </p>
              <p className="mt-2 max-w-xl text-xs leading-5 text-midnight/55">
                General information only. No diagnosis, provider availability, appointment or price
                is confirmed on this page.
              </p>
            </Reveal>

            <ServiceIllustration service={service} />
          </Container>
        </section>

        {catalogSource === 'api' ? (
          <NearbyTechnicianDiscovery serviceSlug={service.slug} serviceTitle={service.title} />
        ) : null}

        <section
          id="common-problems"
          aria-labelledby="common-problems-title"
          className="scroll-mt-24 bg-white py-16 sm:py-20 lg:py-24"
        >
          <Container>
            <Reveal>
              <SectionHeading
                id="common-problems-title"
                eyebrow="Common customer-reported problems"
                title={`What can affect ${service.title.toLowerCase()}?`}
                description="These examples can help you describe a concern. Similar symptoms may have different causes, so they are not a diagnosis."
              />
            </Reveal>
            <Reveal delay={0.06} className="mt-9">
              <ServiceProblems problems={service.problems} />
            </Reveal>
          </Container>
        </section>

        <section
          id="service-includes"
          aria-labelledby="service-includes-title"
          className="scroll-mt-24 border-y border-midnight/8 bg-[#f8faf7] py-16 sm:py-20 lg:py-24"
        >
          <Container className="grid items-start gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                id="service-includes-title"
                eyebrow="What a visit may cover"
                title="Start with a clear inspection."
                description={`The exact work depends on the appliance or home system and what an in-person assessment finds. For ${service.title.toLowerCase()}, typical steps may include:`}
              />
            </Reveal>
            <Reveal delay={0.06}>
              <ol className="grid gap-3">
                {service.inclusions.map((inclusion, index) => (
                  <li
                    key={inclusion}
                    className="flex items-start gap-4 rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef7e5] text-sm font-semibold tabular-nums text-midnight">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="pt-1 text-sm leading-6 text-midnight/75">{inclusion}</span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </Container>
        </section>

        <section
          id="service-journey"
          aria-labelledby="service-journey-title"
          className="bg-midnight py-16 sm:py-20 lg:py-24"
        >
          <Container>
            <Reveal>
              <SectionHeading
                id="service-journey-title"
                eyebrow="The FixNear approach"
                title="A repair conversation with clear steps."
                description="A service request records your issue and preferred window. Admins control technician assignment; the request itself does not confirm an appointment or technician availability."
                tone="light"
              />
            </Reveal>
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {howItWorksSteps.map((step, index) => (
                <Reveal key={step.number} delay={index * 0.05} className="h-full">
                  <li className="flex h-full min-h-[190px] flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-5">
                    <span className="text-2xl font-medium tracking-tight text-lime">
                      {step.number}
                    </span>
                    <h3 className="mt-6 text-base font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/65">{step.description}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
            <p className="mt-6 text-xs leading-5 text-white/50">
              Requests for active catalog services are recorded through the FixNear API. Preferred
              windows are not confirmed appointments, and there is no automatic technician matching.
            </p>
          </Container>
        </section>

        <section
          id="transparent-estimates"
          aria-labelledby="transparent-estimates-title"
          className="scroll-mt-24 bg-white py-16 sm:py-20 lg:py-24"
        >
          <Container className="grid items-start gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                id="transparent-estimates-title"
                eyebrow="PriceLock · itemized quotation"
                title="Review the proposed work before it begins."
                description="After inspection, a technician can submit an itemized quotation for this request. Review the proposed inspection, labour, parts and applicable charges; the total comes from the submitted quote, not this guide."
              />
            </Reveal>
            <Reveal delay={0.06}>
              <ul className="grid gap-3">
                {estimateParts.map(({ title, description, icon: Icon }) => (
                  <li
                    key={title}
                    className="flex items-start gap-4 rounded-2xl border border-midnight/10 bg-[#f8faf7] p-4 sm:p-5"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-midnight shadow-sm">
                      <Icon aria-hidden="true" size={19} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-midnight">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-midnight/65">{description}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-xl border border-midnight/10 bg-white px-4 py-3 text-xs leading-5 text-midnight/55">
                Any applicable charges should be disclosed before work begins. This guide contains
                no live quote or provider-specific price.
              </p>
            </Reveal>
          </Container>
        </section>

        <section
          id="customer-approval"
          aria-labelledby="customer-approval-title"
          className="scroll-mt-24 bg-[#f8faf7] py-14 sm:py-18 lg:py-20"
        >
          <Container>
            <Reveal>
              <div className="relative overflow-hidden rounded-[1.75rem] bg-midnight p-6 text-white sm:p-9 lg:grid lg:grid-cols-[auto_1fr] lg:items-center lg:gap-7 lg:p-12">
                <span className="grid size-14 place-items-center rounded-2xl bg-lime text-midnight">
                  <ShieldCheck aria-hidden="true" size={28} strokeWidth={1.8} />
                </span>
                <div className="mt-5 lg:mt-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-lime">
                    Customer approval
                  </p>
                  <h2
                    id="customer-approval-title"
                    className="mt-3 max-w-3xl text-balance text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl"
                  >
                    Additional work should wait for your approval.
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                    If an inspection changes the proposed scope, the change and any applicable cost
                    should be explained first. The customer should approve it before that extra work
                    proceeds. No additional work is assumed by this guide.
                  </p>
                  <p className="mt-4 max-w-3xl text-xs leading-5 text-white/50">
                    In the database-backed booking flow, paid repair work is gated on approval of
                    the current PriceLock quote. This frontend does not process payments.
                  </p>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        {relatedServices.length > 0 && (
          <section
            aria-labelledby="related-services-title"
            className="bg-white py-16 sm:py-20 lg:py-24"
          >
            <Container>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading
                  id="related-services-title"
                  eyebrow="Keep exploring"
                  title="Related service guides"
                  description="Browse other common home-repair topics. Each guide is informational and does not confirm service availability."
                />
                <Button
                  href="/services"
                  variant="secondary"
                  size="small"
                  className="w-fit shrink-0"
                >
                  All services <ArrowRight aria-hidden="true" size={16} />
                </Button>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedServices.map((relatedService) => (
                  <ServiceCard
                    key={relatedService.slug}
                    serviceSlug={relatedService.slug}
                    service={relatedService}
                    compact
                  />
                ))}
              </div>
            </Container>
          </section>
        )}

        <ServiceFaq serviceName={service.title} questions={service.questions} />

        <section className="border-t border-midnight/8 bg-[#f8faf7] py-12 sm:py-14">
          <Container className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-midnight">
                Want to compare service guides?
              </p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-midnight/65">
                Return to the local directory to search by category or common problem.
              </p>
            </div>
            <Button href="/services" variant="lime" size="medium" className="w-fit shrink-0">
              Browse all services <ArrowRight aria-hidden="true" size={17} />
            </Button>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
