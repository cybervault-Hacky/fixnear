import { ArrowUpRight, CalendarDays, FileClock, ShieldCheck } from 'lucide-react';

import { Container } from '@/components/layout/Container';
import { Reveal } from '@/components/shared/Reveal';
import { SectionHeading } from '@/components/shared/SectionHeading';

const sampleRecords = [
  {
    date: '18 Sep 2025',
    title: 'Drain line cleared',
    detail: 'Example service note · no live record',
  },
  {
    date: '06 Feb 2025',
    title: 'Cooling check',
    detail: 'Example service note · no live record',
  },
] as const;

export function HomePassportSection() {
  return (
    <section
      id="homepassport"
      aria-labelledby="homepassport-title"
      className="scroll-mt-24 bg-[#f8faf7] py-16 sm:py-20 lg:py-24"
    >
      <Container className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <Reveal>
          <aside
            aria-label="Illustrative HomePassport appliance service history"
            className="mx-auto w-full max-w-[560px] rounded-[1.75rem] border border-midnight/10 bg-white p-4 shadow-[0_22px_70px_rgba(16,24,39,0.07)] sm:p-7"
          >
            <div className="rounded-2xl bg-midnight p-5 text-white sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-lime text-midnight">
                    <FileClock aria-hidden="true" size={21} />
                  </span>
                  <div>
                    <p className="text-xs text-white/60">HomePassport · example</p>
                    <h3 className="mt-1 font-semibold">Appliance record</h3>
                  </div>
                </div>
                <span className="rounded-full border border-white/20 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-white/70">
                  Sample UI
                </span>
              </div>

              <div className="mt-6 rounded-xl bg-white/8 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-white/55">Appliance</p>
                    <p className="mt-1 text-base font-semibold">Split AC · Main bedroom</p>
                  </div>
                  <span className="grid size-9 place-items-center rounded-lg bg-white/10 text-lime">
                    <ShieldCheck aria-hidden="true" size={18} />
                  </span>
                </div>
                <div className="mt-5 border-t border-white/12 pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                    Repair history
                  </p>
                  <ol className="grid gap-4">
                    {sampleRecords.map((record) => (
                      <li key={record.date} className="grid grid-cols-[auto_1fr] gap-3">
                        <span className="mt-1.5 size-2 rounded-full bg-lime" aria-hidden="true" />
                        <div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="text-sm font-medium text-white">{record.title}</p>
                            <time className="text-xs text-white/55">{record.date}</time>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-white/55">{record.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-midnight/8 bg-[#f8faf7] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CalendarDays
                  aria-hidden="true"
                  size={18}
                  className="mt-0.5 shrink-0 text-midnight/65"
                />
                <div>
                  <p className="text-sm font-semibold text-midnight">Warranty note</p>
                  <p className="mt-1 text-xs leading-5 text-midnight/60">
                    Example only · 90 days from sample repair
                  </p>
                </div>
              </div>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-midnight/70">
                Illustrative record <ArrowUpRight aria-hidden="true" size={13} />
              </span>
            </div>
            <p className="mt-4 text-center text-xs text-midnight/55">
              No customer account or real service history is shown.
            </p>
          </aside>
        </Reveal>

        <Reveal delay={0.08}>
          <SectionHeading
            id="homepassport-title"
            eyebrow="HomePassport · product concept"
            title="Your home has a history. Keep it close."
            description="HomePassport is designed as a simple home-maintenance record: service dates, repair notes and warranty information in one place."
          />
          <ul className="mt-8 grid gap-4">
            {[
              'Keep a separate record for each appliance.',
              'Find past service notes when a repair comes up again.',
              'Save warranty details alongside the repair record.',
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-6 text-midnight/75">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-lime" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
