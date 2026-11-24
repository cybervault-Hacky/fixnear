import { ArrowRight } from 'lucide-react';

import { Container } from '@/components/layout/Container';
import { Reveal } from '@/components/shared/Reveal';
import { SectionHeading } from '@/components/shared/SectionHeading';
import { howItWorksSteps } from '@/features/home/home-data';

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="scroll-mt-24 bg-midnight py-16 sm:py-20 lg:py-24"
    >
      <Container>
        <Reveal>
          <SectionHeading
            id="how-it-works-title"
            eyebrow="A clearer repair flow"
            title="From the first question to the final note."
            description="A simple service journey should keep you informed and in control at each step."
            tone="light"
          />
        </Reveal>

        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
          {howItWorksSteps.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.06} className="h-full">
              <li className="group flex h-full min-h-[220px] flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-5 transition-colors hover:border-white/25 hover:bg-white/[0.07] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-medium tracking-[-0.04em] text-lime">
                    {step.number}
                  </span>
                  {index < howItWorksSteps.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      size={17}
                      className="text-white/35 transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    />
                  )}
                </div>
                <h3 className="mt-8 text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{step.description}</p>
              </li>
            </Reveal>
          ))}
        </ol>

        <p className="mt-7 text-xs leading-5 text-white/50">
          Requests for active published services can be submitted through FixNear. A preferred
          window is not a confirmed appointment, and paid repair work requires approval of the
          current PriceLock quote.
        </p>
      </Container>
    </section>
  );
}
