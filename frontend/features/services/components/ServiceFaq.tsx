import { ChevronDown } from 'lucide-react';

import type { ServiceQuestion } from '@/features/services/types/service';

type ServiceFaqProps = {
  serviceName: string;
  questions: readonly ServiceQuestion[];
};

export function ServiceFaq({ serviceName, questions }: ServiceFaqProps) {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto grid w-full max-w-[1240px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-10">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-midnight/55">
            Useful answers
          </p>
          <h2
            id="faq-heading"
            className="text-balance text-3xl font-semibold leading-tight tracking-[-0.04em] text-midnight sm:text-4xl"
          >
            {serviceName} questions
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-midnight/65">
            General guidance for common questions. A symptom alone cannot confirm what repair is
            needed.
          </p>
        </div>

        <div className="divide-y divide-midnight/10 border-y border-midnight/10">
          {questions.map(({ question, answer }) => (
            <details key={question} className="group py-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-midnight marker:hidden focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  className="shrink-0 text-midnight/55 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="max-w-2xl pt-3 pr-8 text-sm leading-6 text-midnight/70">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
