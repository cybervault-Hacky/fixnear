import { CalendarDays, ShieldCheck, ShieldX } from 'lucide-react';

import { formatDemoDate, getDemoWarrantyStatus } from '@/features/dashboard/data/demo-data';
import type { DemoWarranty } from '@/features/dashboard/types/dashboard';

type DemoWarrantyCardProps = {
  warranty: DemoWarranty;
  compact?: boolean;
};

export function DemoWarrantyCard({ warranty, compact = false }: DemoWarrantyCardProps) {
  const status = getDemoWarrantyStatus(warranty.expiresOn);
  const ActiveIcon = status === 'active' ? ShieldCheck : ShieldX;
  const statusLabel = status === 'active' ? 'Active sample dates' : 'Expired sample dates';

  return (
    <article className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
            <ShieldCheck aria-hidden="true" size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold leading-5 text-midnight">
              {warranty.coveredItem}
            </h3>
            <p className="mt-1 text-xs leading-5 text-midnight/60">Provider: {warranty.provider}</p>
          </div>
        </div>
        <span
          className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.62rem] font-semibold ${status === 'active' ? 'bg-[#e8f5dc] text-midnight' : 'bg-midnight/[0.06] text-midnight/65'}`}
        >
          <ActiveIcon aria-hidden="true" size={14} />
          {statusLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-midnight/8 pt-4 text-xs">
        <div>
          <dt className="text-midnight/50">Sample start date</dt>
          <dd className="mt-1 font-semibold text-midnight">{formatDemoDate(warranty.startsOn)}</dd>
        </div>
        <div>
          <dt className="text-midnight/50">Sample expiry date</dt>
          <dd className="mt-1 font-semibold text-midnight">{formatDemoDate(warranty.expiresOn)}</dd>
        </div>
      </dl>
      {!compact ? (
        <div className="mt-4 rounded-xl bg-[#f8faf7] p-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-midnight">
            <CalendarDays aria-hidden="true" size={15} />
            Example terms
          </p>
          <p className="mt-2 text-xs leading-5 text-midnight/65">{warranty.terms}</p>
        </div>
      ) : null}
      <p className="mt-3 text-[0.68rem] leading-5 text-midnight/45">
        Sample dates only. This status does not promise warranty coverage.
      </p>
    </article>
  );
}
