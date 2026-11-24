import { BriefcaseBusiness, CalendarDays, ClipboardList } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { TechnicianJobStatusBadge } from '@/features/technician/components/TechnicianJobStatusBadge';
import {
  DEMO_TECHNICIAN_JOBS,
  formatDemoRupees,
  formatTechnicianDemoDate,
} from '@/features/technician/data/demo-data';

export function TechnicianJobsPage() {
  return (
    <>
      <DashboardPageHeader
        eyebrow="Work history · sample activity"
        title="A work history example, not a job feed."
        description="Review illustrative completed and cancelled status cards and expandable detail summaries. These entries are not assigned work, and no customer contact or booking flow exists."
      />

      <DashboardCard
        title="Illustrative work history"
        description="All dates, references, service notes, durations and amounts below are fictional UI examples."
        icon={BriefcaseBusiness}
      >
        <DashboardEmptyState
          compact
          icon={ClipboardList}
          title="No live work history is connected"
          description="The cards below are sample layouts only. No real technician activity, customer, assignment or service visit is shown."
        />

        <ol className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          {DEMO_TECHNICIAN_JOBS.map((job) => (
            <li key={job.id}>
              <article className="h-full min-w-0 rounded-2xl border border-midnight/10 bg-white p-4 shadow-[0_8px_30px_rgba(16,24,39,0.025)] sm:p-5">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
                      <BriefcaseBusiness aria-hidden="true" size={18} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold text-midnight">
                        {job.service}
                      </h2>
                      <p className="mt-1 break-words text-xs leading-5 text-midnight/55">
                        {job.reference} · demo reference
                      </p>
                    </div>
                  </div>
                  <TechnicianJobStatusBadge status={job.status} />
                </div>

                <dl className="mt-4 grid gap-3 border-t border-midnight/8 pt-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-midnight/50">Sample date</dt>
                    <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-midnight">
                      <CalendarDays
                        aria-hidden="true"
                        size={15}
                        className="shrink-0 text-midnight/50"
                      />
                      {formatTechnicianDemoDate(job.date)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-midnight/50">Duration</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-midnight">
                      {job.duration}
                    </dd>
                  </div>
                  {typeof job.sampleAmount === 'number' ? (
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-xs text-midnight/50">
                        Fictional example amount · not payment
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-midnight">
                        {formatDemoRupees(job.sampleAmount)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <details className="group mt-4 border-t border-midnight/8 pt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 text-sm font-semibold text-midnight/75 hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-midnight [&::-webkit-details-marker]:hidden">
                    View sample job details
                    <span aria-hidden="true" className="text-lg leading-none text-midnight/45">
                      +
                    </span>
                  </summary>
                  <div className="mt-2 rounded-xl bg-[#f8faf7] p-3.5">
                    <p className="text-xs leading-5 text-midnight/70">{job.summary}</p>
                    <p className="mt-2 text-xs leading-5 text-midnight/50">
                      Demo reference: {job.reference}. No customer identity or contact details are
                      available.
                    </p>
                  </div>
                </details>
              </article>
            </li>
          ))}
        </ol>
      </DashboardCard>

      <p className="mt-5 text-xs leading-5 text-midnight/55">
        No live job assignment, booking, work order, customer messaging, service completion or
        cancellation workflow is implemented.
      </p>
    </>
  );
}
