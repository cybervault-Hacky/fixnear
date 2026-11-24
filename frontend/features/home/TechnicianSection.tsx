import { ArrowUpRight, ClipboardCheck, FileText, House } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { ComingSoonButton } from '@/components/ui/ComingSoonButton';
import { Reveal } from '@/components/shared/Reveal';

const technicianBenefits = [
  {
    icon: FileText,
    title: 'Explain estimates clearly',
    description: 'Keep proposed work and parts easy for customers to review.',
  },
  {
    icon: ClipboardCheck,
    title: 'Confirm changes together',
    description: 'Make the approval step visible when a job scope needs to change.',
  },
  {
    icon: House,
    title: 'Leave a useful service note',
    description: 'Help customers keep a simple record of the work completed.',
  },
] as const;

export function TechnicianSection() {
  return (
    <section
      id="for-technicians"
      aria-labelledby="technician-title"
      className="scroll-mt-24 bg-[#f8faf7] py-16 sm:py-20 lg:py-24"
    >
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-16">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-midnight/60">
              For technicians
            </p>
            <h2
              id="technician-title"
              className="text-balance text-3xl font-semibold leading-tight tracking-[-0.04em] text-midnight sm:text-4xl lg:text-[3.25rem]"
            >
              Good work deserves a clear record.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-midnight/70 sm:text-lg">
              FixNear is being designed to help independent technicians explain the work, share
              changes for approval, and leave customers with useful service notes.
            </p>
            <ComingSoonButton
              message="Technician sign-up is not open in this preview. No registration data is collected."
              variant="primary"
              size="medium"
              className="mt-7"
            >
              Join as a technician <ArrowUpRight aria-hidden="true" size={17} />
            </ComingSoonButton>
            <div className="mt-4">
              <Link
                href="/technician"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight transition-colors hover:border-midnight/30 hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
              >
                Preview the technician dashboard demo
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
              <p className="mt-2 text-xs text-midnight/55">
                Interface preview only · no registration or technician account is created.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
            {technicianBenefits.map(({ icon: Icon, title, description }, index) => (
              <Reveal key={title} delay={index * 0.07} className="h-full">
                <article className="h-full min-h-[200px] rounded-2xl border border-midnight/10 bg-white p-5 sm:p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-lime text-midnight">
                    <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                  </span>
                  <h3 className="mt-6 text-base font-semibold leading-6 text-midnight">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-midnight/65">{description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
