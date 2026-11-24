'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';

import { getServiceBySlug } from '@/features/services/data/services';
import type { ServiceDefinition } from '@/features/services/types/service';

type ServiceCardProps = {
  serviceSlug: string;
  service?: ServiceDefinition;
  compact?: boolean;
};

export function ServiceCard({
  serviceSlug,
  service: providedService,
  compact = false,
}: ServiceCardProps) {
  const service = providedService ?? getServiceBySlug(serviceSlug);
  const reducedMotion = useReducedMotion();

  if (!service) return null;

  const Icon = service.icon;

  return (
    <motion.article
      layout={!reducedMotion}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
      transition={{
        duration: reducedMotion ? 0 : 0.22,
        layout: { duration: reducedMotion ? 0 : 0.24 },
      }}
      className="h-full"
    >
      <Link
        href={`/services/${service.slug}`}
        className={`group flex h-full flex-col rounded-2xl border border-midnight/10 bg-white shadow-[0_8px_28px_rgba(16,24,39,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-midnight/20 hover:shadow-[0_18px_40px_rgba(16,24,39,0.09)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-midnight motion-reduce:transition-none ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight transition-colors group-hover:bg-lime motion-reduce:transition-none">
            <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <span className="rounded-full border border-midnight/10 px-2.5 py-1 text-[0.62rem] font-semibold text-midnight/55">
            {service.group}
          </span>
        </div>

        <h3
          className={`mt-5 font-semibold leading-6 text-midnight ${compact ? 'text-base' : 'text-lg'}`}
        >
          {service.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-midnight/65">{service.listingDescription}</p>

        {!compact && (
          <div className="mt-5 border-t border-midnight/8 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-midnight/50">
              Common issues
            </p>
            <ul className="mt-2 grid gap-1.5">
              {service.problems.slice(0, 2).map((problem) => (
                <li
                  key={problem.title}
                  className="flex items-start gap-2 text-xs leading-5 text-midnight/65"
                >
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-lime" />
                  {problem.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        <span className="mt-auto inline-flex min-h-10 items-center gap-2 pt-4 text-sm font-semibold text-midnight">
          Explore service guide
          <ArrowUpRight
            aria-hidden="true"
            size={16}
            className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:translate-x-0"
          />
        </span>
      </Link>
    </motion.article>
  );
}
