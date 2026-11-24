import { CircleAlert } from 'lucide-react';

import type { ServiceProblem } from '@/features/services/types/service';

type ServiceProblemsProps = {
  problems: readonly ServiceProblem[];
};

export function ServiceProblems({ problems }: ServiceProblemsProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {problems.map((problem, index) => (
        <li
          key={problem.title}
          className="rounded-2xl border border-midnight/10 bg-white p-5 shadow-[0_8px_28px_rgba(16,24,39,0.035)] sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
              <CircleAlert aria-hidden="true" size={19} strokeWidth={1.8} />
            </span>
            <span className="text-xs font-semibold tabular-nums text-midnight/35">
              {String(index + 1).padStart(2, '0')}
            </span>
          </div>
          <h3 className="mt-5 text-base font-semibold leading-6 text-midnight">{problem.title}</h3>
          <p className="mt-2 text-sm leading-6 text-midnight/65">{problem.description}</p>
        </li>
      ))}
    </ul>
  );
}
