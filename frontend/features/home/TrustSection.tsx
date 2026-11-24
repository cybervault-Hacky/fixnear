import { Check } from 'lucide-react';

import { Container } from '@/components/layout/Container';
import { Reveal } from '@/components/shared/Reveal';
import { SectionHeading } from '@/components/shared/SectionHeading';
import { transparencyPrinciples } from '@/features/home/home-data';

export function TrustSection() {
  return (
    <section
      id="transparency"
      aria-labelledby="transparency-title"
      className="scroll-mt-24 border-y border-midnight/6 bg-[#f8faf7] py-16 sm:py-20 lg:py-24"
    >
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              id="transparency-title"
              eyebrow="The FixNear approach"
              title="Know what’s proposed before work moves ahead."
              description="Home repairs can feel uncertain. FixNear is designed to make the scope, approval and service record easier to understand."
            />
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
            {transparencyPrinciples.map(({ icon: Icon, number, title, description }, index) => (
              <Reveal key={number} delay={index * 0.07} className="h-full">
                <article className="flex h-full min-h-[230px] flex-col rounded-2xl border border-midnight/10 bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#eef7e5] text-midnight">
                      <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-midnight/40">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-6 text-base font-semibold leading-6 text-midnight">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-midnight/65">{description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="mt-10 flex items-start gap-3 rounded-xl border border-midnight/10 bg-white px-4 py-3.5 text-sm leading-6 text-midnight/65 sm:items-center">
          <Check aria-hidden="true" className="mt-0.5 shrink-0 text-midnight sm:mt-0" size={18} />
          <p>
            These are product principles and previews—not claims about completed FixNear services or
            technician availability.
          </p>
        </div>
      </Container>
    </section>
  );
}
