import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type DashboardEmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
};

export function DashboardEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
}: DashboardEmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-midnight/18 bg-[#f8faf7] text-center ${compact ? 'px-4 py-5' : 'px-5 py-8 sm:px-7 sm:py-10'}`}
    >
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-white text-midnight/65 shadow-sm">
        <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-midnight">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-midnight/60 sm:text-sm sm:leading-6">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
