import { ArrowRight, Check, CircleHelp, ReceiptText } from 'lucide-react';

import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/shared/Reveal';
import { SectionHeading } from '@/components/shared/SectionHeading';

const estimateItems = [
  { label: 'AC inspection visit', amount: '₹499' },
  { label: 'Example replacement part', amount: '₹850' },
  { label: 'Example labour', amount: '₹400' },
] as const;

export function PriceLockSection() {
  return (
    <section
      id="pricelock"
      aria-labelledby="pricelock-title"
      className="scroll-mt-24 overflow-hidden bg-white py-16 sm:py-20 lg:py-24"
    >
      <Container className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <SectionHeading
            id="pricelock-title"
            eyebrow="PriceLock · product concept"
            title="An estimate you can actually review."
            description="PriceLock is designed around itemised estimates, clear scope, and a simple rule: work outside the agreed estimate should be explained and approved by the customer first."
          />
          <ul className="mt-8 grid gap-4">
            {[
              'See what each line item covers.',
              'Know what is included—and what is not.',
              'Review extra work before it moves ahead.',
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-6 text-midnight/75">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#eef7e5] text-midnight">
                  <Check aria-hidden="true" size={13} strokeWidth={2.5} />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <Button href="#how-it-works" variant="secondary" size="small" className="mt-8 w-fit">
            How approval works <ArrowRight aria-hidden="true" size={16} />
          </Button>
        </Reveal>

        <Reveal delay={0.08}>
          <aside
            aria-label="Illustrative itemised estimate; sample amounts only"
            className="relative mx-auto w-full max-w-[560px]"
          >
            <div
              aria-hidden="true"
              className="absolute -right-8 -top-8 size-40 rounded-full bg-lime/35 blur-3xl"
            />
            <div className="relative rounded-[1.75rem] border border-midnight/10 bg-[#f8faf7] p-4 shadow-[0_22px_70px_rgba(16,24,39,0.08)] sm:p-7">
              <div className="rounded-2xl border border-midnight/8 bg-white p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-midnight text-lime">
                      <ReceiptText aria-hidden="true" size={21} />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-midnight/55">Illustrative estimate</p>
                      <h3 className="mt-1 text-base font-semibold text-midnight">
                        AC repair · sample
                      </h3>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#f1f5ed] px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-midnight/70">
                    For review
                  </span>
                </div>

                <div className="mt-6 grid gap-4 border-y border-midnight/8 py-5">
                  {estimateItems.map(({ label, amount }) => (
                    <div key={label} className="flex items-start justify-between gap-4 text-sm">
                      <span className="text-midnight/65">{label}</span>
                      <span className="shrink-0 font-medium tabular-nums text-midnight">
                        {amount}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm font-semibold text-midnight">Example total</span>
                  <span className="text-xl font-semibold tracking-tight text-midnight">₹1,749</span>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-lime/70 bg-[#f1f8e9] p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
                    <CircleHelp aria-hidden="true" size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-midnight">Extra work is not assumed</p>
                    <p className="mt-1 text-xs leading-5 text-midnight/70">
                      Any change to the agreed scope should be explained for customer approval
                      first.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-xs leading-5 text-midnight/55">
                Sample amounts are illustrative only—not a FixNear quote or a published price.
              </p>
            </div>
          </aside>
        </Reveal>
      </Container>
    </section>
  );
}
