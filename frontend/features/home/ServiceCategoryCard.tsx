import { ArrowUpRight } from 'lucide-react';

import type { ServiceCategory } from '@/features/home/home-data';

type ServiceCategoryCardProps = {
  category: ServiceCategory;
  onSelect: (title: string) => void;
};

export function ServiceCategoryCard({ category, onSelect }: ServiceCategoryCardProps) {
  const Icon = category.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(category.title)}
      className="group flex min-h-[164px] flex-col items-start rounded-2xl border border-midnight/10 bg-white p-4 text-left shadow-[0_4px_18px_rgba(16,24,39,0.025)] transition duration-200 hover:-translate-y-1 hover:border-midnight/20 hover:shadow-[0_14px_34px_rgba(16,24,39,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight active:scale-[0.99] motion-reduce:transition-none sm:min-h-[180px] sm:p-5"
      aria-label={`Choose ${category.title}`}
    >
      <span className="grid size-11 place-items-center rounded-xl bg-[#f1f5ed] text-midnight transition-colors group-hover:bg-lime">
        <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
      </span>
      <span className="mt-5 flex w-full items-center justify-between gap-2">
        <span className="text-sm font-semibold leading-5 text-midnight sm:text-base">
          {category.title}
        </span>
        <ArrowUpRight
          aria-hidden="true"
          size={16}
          className="shrink-0 text-midnight/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:translate-x-0"
        />
      </span>
      <span className="mt-1 text-xs leading-5 text-midnight/60">{category.description}</span>
    </button>
  );
}
