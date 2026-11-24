import { CalendarDays, ClipboardList } from 'lucide-react';

import { formatDemoDate } from '@/features/dashboard/data/demo-data';
import type { DemoActivity } from '@/features/dashboard/types/dashboard';

type DemoActivityCardProps = {
  activity: DemoActivity;
  compact?: boolean;
};

const progressLabels = ['Request noted', 'Estimate discussion', 'Service note'];

const statusStyles = {
  Completed: 'bg-[#e8f5dc] text-midnight',
  'In progress': 'bg-[#edf0f4] text-midnight',
  Scheduled: 'bg-midnight/[0.05] text-midnight/70',
} as const;

export function DemoActivityCard({ activity, compact = false }: DemoActivityCardProps) {
  return (
    <article className="rounded-2xl border border-midnight/10 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
            <ClipboardList aria-hidden="true" size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-midnight">{activity.service}</h3>
            <p className="mt-1 text-xs leading-5 text-midnight/60">{activity.summary}</p>
          </div>
        </div>
        <span
          className={`inline-flex min-h-8 w-fit shrink-0 items-center rounded-full px-3 text-[0.68rem] font-semibold ${statusStyles[activity.status]}`}
        >
          Sample status · {activity.status}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-midnight/55">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays aria-hidden="true" size={14} />
          {formatDemoDate(activity.date)}
        </span>
        <span className="font-medium tabular-nums">{activity.reference} · demo ID</span>
      </div>

      {!compact ? (
        <ol
          aria-label={`Illustrative status steps for ${activity.service}`}
          className="mt-5 grid grid-cols-3 gap-2 border-t border-midnight/8 pt-4"
        >
          {progressLabels.map((label, index) => {
            const complete = index <= activity.stage;
            return (
              <li
                key={label}
                aria-current={index === activity.stage ? 'step' : undefined}
                className="min-w-0"
              >
                <span
                  aria-hidden="true"
                  className={`mb-2 block h-1 rounded-full ${complete ? 'bg-lime' : 'bg-midnight/10'}`}
                />
                <span
                  className={`block text-[0.62rem] leading-4 sm:text-xs ${
                    index === activity.stage ? 'font-semibold text-midnight' : 'text-midnight/50'
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="mt-3 text-[0.65rem] leading-4 text-midnight/45">
        Demonstration item only · not a booking or live service update.
      </p>
    </article>
  );
}
