import type { ReactNode } from 'react';

type DashboardPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  action,
}: DashboardPageHeaderProps) {
  return (
    <header className="mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-midnight/55">
          {eyebrow}
        </p>
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.05em] text-midnight sm:text-4xl lg:text-[2.8rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-midnight/65 sm:text-base sm:leading-7">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
