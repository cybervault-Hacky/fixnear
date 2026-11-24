import { ArrowDownRight, Check, CircleDot } from 'lucide-react';

import type { ServiceDefinition } from '@/features/services/types/service';

type ServiceIllustrationProps = {
  service: ServiceDefinition;
};

export function ServiceIllustration({ service }: ServiceIllustrationProps) {
  const Icon = service.icon;
  const featuredProblems = service.problems.slice(0, 2);

  return (
    <figure
      role="img"
      aria-label={`Illustration for ${service.title}: an example service checklist, not a live job or estimate.`}
      className="relative isolate mx-auto w-full max-w-[580px] overflow-hidden rounded-[2rem] bg-midnight p-5 shadow-[0_26px_70px_rgba(16,24,39,0.18)] sm:p-7"
    >
      <div aria-hidden="true" className="service-illustration-grid absolute inset-0" />
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-20 size-64 rounded-full bg-lime/20 blur-[80px]"
      />

      <div className="relative z-10 flex items-center justify-between gap-3 text-white/75">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime text-midnight">
            <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <span className="truncate text-sm font-medium">{service.title} guide</span>
        </div>
        <span className="shrink-0 rounded-full border border-white/20 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white/65">
          Illustrative
        </span>
      </div>

      <div className="relative z-10 mx-auto mt-7 max-w-[430px] rounded-2xl bg-white p-4 shadow-[0_22px_56px_rgba(0,0,0,0.24)] sm:mt-9 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
              <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-midnight/50">
                Service guide
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-midnight">{service.title}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#f1f5ed] px-2.5 py-1 text-[0.6rem] font-semibold text-midnight/70">
            Typical checks
          </span>
        </div>

        <div className="my-5 h-px bg-midnight/10" />
        <div className="grid gap-3">
          {featuredProblems.map((problem) => (
            <div key={problem.title} className="flex items-start gap-3">
              <CircleDot aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-slate" />
              <span className="text-sm leading-5 text-midnight/75">{problem.title}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#eef7e5] p-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
            <Check aria-hidden="true" size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-midnight">Scope explained first</p>
            <p className="mt-0.5 text-xs leading-5 text-midnight/65">
              Extra work is presented for approval before it proceeds.
            </p>
          </div>
          <ArrowDownRight
            aria-hidden="true"
            size={16}
            className="ml-auto shrink-0 text-midnight/55"
          />
        </div>
      </div>

      <p className="relative z-10 mt-4 text-center text-xs text-white/55">
        Product concept only · no live provider or price information
      </p>
    </figure>
  );
}
