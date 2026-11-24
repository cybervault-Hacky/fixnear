import { AirVent, ChevronDown, Refrigerator } from 'lucide-react';

import { formatDemoDate } from '@/features/dashboard/data/demo-data';
import type { DemoAppliance } from '@/features/dashboard/types/dashboard';

type DemoApplianceCardProps = {
  appliance: DemoAppliance;
  compact?: boolean;
};

export function DemoApplianceCard({ appliance, compact = false }: DemoApplianceCardProps) {
  const Icon = appliance.type.toLowerCase().includes('air conditioner') ? AirVent : Refrigerator;

  return (
    <article className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
            <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-midnight">{appliance.name}</h3>
            <p className="mt-1 text-xs leading-5 text-midnight/60">{appliance.type}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-midnight/10 bg-[#f8faf7] px-2.5 py-1 text-[0.62rem] font-semibold text-midnight/60">
          Demo record
        </span>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-midnight/8 pt-4 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-midnight/50">Example brand</dt>
          <dd className="mt-1 font-semibold text-midnight">{appliance.brand}</dd>
        </div>
        {!compact ? (
          <>
            <div>
              <dt className="text-midnight/50">Purchase date · sample</dt>
              <dd className="mt-1 font-semibold text-midnight">
                {formatDemoDate(appliance.purchaseDate)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-midnight/50">Location label · fictional</dt>
              <dd className="mt-1 font-semibold text-midnight">{appliance.location}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-midnight/50">Purchase date · sample</dt>
            <dd className="mt-1 font-semibold text-midnight">
              {formatDemoDate(appliance.purchaseDate)}
            </dd>
          </div>
        )}
      </dl>

      {!compact ? (
        <details className="group mt-4 border-t border-midnight/8 pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-semibold text-midnight marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight [&::-webkit-details-marker]:hidden">
            View sample service and parts history
            <ChevronDown
              aria-hidden="true"
              size={17}
              className="shrink-0 text-midnight/55 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="grid gap-4 pb-2 pt-2 sm:grid-cols-2">
            <section aria-label={`${appliance.name} example service history`}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/50">
                Service history · sample
              </h4>
              <ul className="mt-2 grid gap-2">
                {appliance.serviceHistory.map((entry) => (
                  <li key={`${entry.date}-${entry.title}`} className="rounded-xl bg-[#f8faf7] p-3">
                    <p className="text-xs font-semibold text-midnight">{entry.title}</p>
                    <p className="mt-1 text-[0.68rem] text-midnight/55">
                      {formatDemoDate(entry.date)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-midnight/60">{entry.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label={`${appliance.name} example parts history`}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/50">
                Parts replaced · sample
              </h4>
              <ul className="mt-2 grid gap-2">
                {appliance.partsHistory.map((entry) => (
                  <li key={`${entry.date}-${entry.part}`} className="rounded-xl bg-[#f8faf7] p-3">
                    <p className="text-xs font-semibold text-midnight">{entry.part}</p>
                    <p className="mt-1 text-[0.68rem] text-midnight/55">
                      {formatDemoDate(entry.date)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-midnight/60">{entry.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <p className="text-[0.68rem] leading-5 text-midnight/45">
            These example entries do not represent actual purchases, repairs or parts.
          </p>
        </details>
      ) : null}
    </article>
  );
}
