import { useId, type ReactNode } from 'react';

import type { LucideIcon } from 'lucide-react';

type DashboardCardProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function DashboardCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = '',
  bodyClassName = '',
}: DashboardCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-2xl border border-midnight/10 bg-white shadow-[0_8px_30px_rgba(16,24,39,0.035)] ${className}`}
    >
      <header className="flex flex-col gap-3 border-b border-midnight/8 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={headingId} className="text-base font-semibold leading-6 text-midnight">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-5 text-midnight/60">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0 sm:pt-0.5">{action}</div> : null}
      </header>
      <div className={`p-5 sm:p-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
