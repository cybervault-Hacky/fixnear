import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  FileCheck2,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { DEMO_VERIFICATION_STAGES } from '@/features/technician/data/demo-data';

const stageIcons = [UserRound, Wrench, ShieldCheck, FileCheck2, BadgeCheck] as const;

const inlineLinkClassName =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/70 transition-colors hover:bg-midnight/[0.04] hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none';

export function TechnicianVerificationPage() {
  return (
    <>
      <DashboardPageHeader
        eyebrow="Verification · future-stage preview"
        title="A preview of future verification stages."
        description="See how profile, skills, identity, document review and approval stages might be presented. This is not a real verification process and does not collect sensitive information."
      />

      <DashboardCard
        title="Future process outline"
        description="Statuses below are demonstration labels only. No step is submitted, checked or approved."
        icon={ShieldCheck}
      >
        <DashboardEmptyState
          compact
          icon={ClipboardList}
          title="No identity documents are collected"
          description="This preview has no upload control and does not request identity numbers, document images, financial details or other sensitive personal information."
        />

        <ol className="mt-5 grid gap-3">
          {DEMO_VERIFICATION_STAGES.map((stage, index) => {
            const Icon = stageIcons[index];
            const isDemoInformation = stage.status === 'Demo information';

            return (
              <li
                key={stage.id}
                className="flex min-w-0 items-start gap-3 rounded-2xl border border-midnight/10 bg-white p-4 sm:gap-4 sm:p-5"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-11 shrink-0 place-items-center rounded-xl ${isDemoInformation ? 'bg-[#edf6e4] text-midnight' : 'bg-[#f1f3f5] text-midnight/55'}`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-semibold text-midnight">{stage.title}</p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${isDemoInformation ? 'bg-lime/60 text-midnight' : 'bg-[#f1f3f5] text-midnight/60'}`}
                    >
                      {stage.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-midnight/60 sm:text-sm sm:leading-6">
                    {stage.summary}
                  </p>
                </div>
                <span className="hidden shrink-0 text-xs font-semibold tabular-nums text-midnight/35 sm:block">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </li>
            );
          })}
        </ol>
      </DashboardCard>

      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
        <article className="min-w-0 rounded-2xl border border-midnight/10 bg-white p-5">
          <h2 className="text-sm font-semibold text-midnight">Profile and skills are examples</h2>
          <p className="mt-2 text-xs leading-5 text-midnight/60">
            Editing sample profile information or choosing a service category does not verify
            identity, training, professional history or qualifications.
          </p>
          <Link className={`${inlineLinkClassName} mt-2 -ml-2`} href="/technician/profile">
            Review profile preview <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </article>
        <article className="min-w-0 rounded-2xl border border-midnight/10 bg-white p-5">
          <h2 className="text-sm font-semibold text-midnight">Approval is not available</h2>
          <p className="mt-2 text-xs leading-5 text-midnight/60">
            There is no reviewer, application submission, identity check, document review, decision
            or approval represented in this frontend-only demonstration.
          </p>
        </article>
      </div>
    </>
  );
}
