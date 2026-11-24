import { ArrowUpRight, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/shared/Reveal';

export function FinalCtaSection() {
  return (
    <section
      id="contact"
      aria-labelledby="final-cta-title"
      className="bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24"
    >
      <Reveal className="mx-auto max-w-[1240px]">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-midnight px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-16 lg:py-16">
          <div aria-hidden="true" className="final-cta-orb" />
          <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-lime">
                <Sparkles aria-hidden="true" size={15} />
                FixNear · Pune
              </p>
              <h2
                id="final-cta-title"
                className="text-balance text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl lg:text-[3.25rem]"
              >
                A better repair experience starts with a clearer conversation.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                Explore the service categories and product concepts. Live technician matching is not
                connected in this preview.
              </p>
            </div>
            <Button href="#services" variant="lime" size="large" className="w-fit shrink-0">
              Explore services <ArrowUpRight aria-hidden="true" size={18} />
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
