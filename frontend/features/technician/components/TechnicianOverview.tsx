'use client';

import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ClipboardList,
  MapPinned,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { TechnicianJobStatusBadge } from '@/features/technician/components/TechnicianJobStatusBadge';
import {
  DEMO_EARNINGS_TRANSACTIONS,
  DEMO_TECHNICIAN_JOBS,
  DEMO_VERIFICATION_STAGES,
  formatDemoRupees,
  formatTechnicianDemoDate,
  sumDemoTransactionValues,
  TECHNICIAN_DAYS,
  TECHNICIAN_SERVICE_CATEGORIES,
} from '@/features/technician/data/demo-data';
import { useTechnicianDemo } from '@/features/technician/context/TechnicianDemoContext';

const overviewLinks = [
  {
    title: 'Profile',
    description: 'Edit fictional contact and experience details.',
    href: '/technician/profile',
    icon: UserRound,
  },
  {
    title: 'Services & skills',
    description: 'Select sample service categories and experience.',
    href: '/technician/services',
    icon: Wrench,
  },
  {
    title: 'Service coverage',
    description: 'Choose broad, illustrative Pune zones.',
    href: '/technician/coverage',
    icon: MapPinned,
  },
  {
    title: 'Availability',
    description: 'Preview weekly time-range preferences.',
    href: '/technician/availability',
    icon: CalendarDays,
  },
  {
    title: 'Work history',
    description: 'Review fictional completed and cancelled entries.',
    href: '/technician/jobs',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Earnings overview',
    description: 'Inspect sample rupee figures and chart.',
    href: '/technician/earnings',
    icon: BarChart3,
  },
  {
    title: 'Verification stages',
    description: 'See a future-flow preview, with no uploads.',
    href: '/technician/verification',
    icon: ShieldCheck,
  },
] as const;

const inlineLinkClassName =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/70 transition-colors hover:bg-midnight/[0.04] hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none';

function formatDayList(dayIds: readonly string[]) {
  return TECHNICIAN_DAYS.filter(({ id }) => dayIds.includes(id)).map(({ short }) => short);
}

function formatTimeRange(start: string, end: string) {
  return `${start}–${end}`;
}

function getProfilePreview(
  profile: {
    fullName: string;
    email: string;
    professionalDescription: string;
    yearsExperience: string;
  },
  selectedServiceCount: number,
  areaCount: number,
  availableDayCount: number,
) {
  const sections = [
    Boolean(profile.fullName.trim()),
    Boolean(profile.email.trim()),
    Boolean(profile.professionalDescription.trim()),
    Boolean(profile.yearsExperience.trim()),
    selectedServiceCount > 0,
    areaCount > 0,
    availableDayCount > 0,
  ];
  const complete = sections.filter(Boolean).length;

  return {
    complete,
    total: sections.length,
    percentage: Math.round((complete / sections.length) * 100),
  };
}

export function TechnicianOverview() {
  const { profile, services, coverageAreas, availability } = useTechnicianDemo();
  const selectedServices = services.filter((service) => service.selected);
  const selectedCategories = TECHNICIAN_SERVICE_CATEGORIES.filter((category) =>
    selectedServices.some((service) => service.id === category.id),
  );
  const availableDays = TECHNICIAN_DAYS.filter(({ id }) => availability[id].available);
  const profilePreview = getProfilePreview(
    profile,
    selectedServices.length,
    coverageAreas.length,
    availableDays.length,
  );
  const firstName = profile.fullName.trim().split(/\s+/)[0] || 'there';
  const sampleWorkValue = sumDemoTransactionValues(DEMO_EARNINGS_TRANSACTIONS);
  const firstAvailableDay = availableDays[0];
  const firstAvailableTime = firstAvailableDay ? availability[firstAvailableDay.id] : undefined;

  return (
    <>
      <DashboardPageHeader
        eyebrow="Technician dashboard · fictional preview"
        title={`Welcome, ${firstName}.`}
        description="Explore a sample professional profile, service preferences, broad coverage zones, weekly availability, work history and earnings-style figures. Nothing here represents a live technician account."
        action={
          <Button href="/technician/profile" variant="secondary" size="small">
            Review profile <ArrowRight aria-hidden="true" size={15} />
          </Button>
        }
      />

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="min-w-0 rounded-2xl border border-midnight/10 bg-white p-4 shadow-[0_8px_30px_rgba(16,24,39,0.025)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-midnight/50">
              Profile preview
            </p>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
              <UserRound aria-hidden="true" size={17} strokeWidth={1.8} />
            </span>
          </div>
          <p className="mt-4 text-lg font-semibold tracking-tight text-midnight">
            {profilePreview.percentage}% sample fields
          </p>
          <p className="mt-1 break-words text-xs font-medium text-midnight/65">
            {profile.fullName} · {profile.yearsExperience} sample years
          </p>
          <p className="break-all text-[0.65rem] leading-5 text-midnight/50">
            {profile.email} · fictional contact
          </p>
          <div
            role="progressbar"
            aria-label="Demo profile completion preview"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={profilePreview.percentage}
            aria-valuetext={`${profilePreview.complete} of ${profilePreview.total} fictional profile sections filled`}
            className="mt-3 h-2 overflow-hidden rounded-full bg-midnight/10"
          >
            <span
              aria-hidden="true"
              className="block h-full rounded-full bg-lime transition-[width] motion-reduce:transition-none"
              style={{ width: `${profilePreview.percentage}%` }}
            />
          </div>
          <p className="mt-2 min-h-10 text-xs leading-5 text-midnight/60">
            {profilePreview.complete} of {profilePreview.total} example sections filled; not an
            approval or verification score.
          </p>
          <Link className={`${inlineLinkClassName} -ml-2 mt-1`} href="/technician/profile">
            Edit demo profile <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </article>

        <SummaryTile
          icon={Wrench}
          eyebrow="Selected services"
          title={`${selectedServices.length} sample ${selectedServices.length === 1 ? 'category' : 'categories'}`}
          detail={
            selectedCategories.length
              ? selectedCategories.map(({ title }) => title).join(' · ')
              : 'No sample categories are selected.'
          }
          href="/technician/services"
          action="Review services"
        />
        <SummaryTile
          icon={MapPinned}
          eyebrow="Coverage summary"
          title={`${coverageAreas.length} sample ${coverageAreas.length === 1 ? 'zone' : 'zones'}`}
          detail={coverageAreas.length ? coverageAreas.join(' · ') : 'No demo zones selected.'}
          href="/technician/coverage"
          action="Edit zones"
        />
        <SummaryTile
          icon={CalendarDays}
          eyebrow="Availability preview"
          title={`${availableDays.length} sample ${availableDays.length === 1 ? 'day' : 'days'}`}
          detail={
            firstAvailableDay && firstAvailableTime
              ? `${formatDayList(availableDays.map(({ id }) => id)).join(', ')} · ${formatTimeRange(firstAvailableTime.start, firstAvailableTime.end)}`
              : 'No sample days are marked available.'
          }
          href="/technician/availability"
          action="Edit schedule"
        />
      </div>

      <div className="mt-5 grid min-w-0 items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid min-w-0 gap-5">
          <DashboardCard
            title="Selected service categories"
            description="These fictional preferences are not credentials, certifications or verified skills."
            icon={Wrench}
            action={
              <Link className={inlineLinkClassName} href="/technician/services">
                Manage <ArrowRight aria-hidden="true" size={14} />
              </Link>
            }
          >
            {selectedCategories.length === 0 ? (
              <DashboardEmptyState
                compact
                icon={Wrench}
                title="No sample services selected"
                description="Choose a service category to preview how a technician skill summary could look."
                action={
                  <Link className={inlineLinkClassName} href="/technician/services">
                    Choose demo services
                  </Link>
                }
              />
            ) : (
              <ul
                className="flex flex-wrap gap-2"
                aria-label="Selected fictional service categories"
              >
                {selectedCategories.map(({ id, title }) => (
                  <li
                    key={id}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-midnight/10 bg-[#f8faf7] px-3 py-2 text-xs font-semibold text-midnight"
                  >
                    <Check aria-hidden="true" size={14} className="shrink-0 text-midnight/55" />
                    <span className="break-words">{title}</span>
                    <span className="shrink-0 text-midnight/45">· demo</span>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Pune coverage preview"
            description="Broad, fictional zone labels only; no map, address or customer location is stored."
            icon={MapPinned}
            action={
              <Link className={inlineLinkClassName} href="/technician/coverage">
                Manage zones <ArrowRight aria-hidden="true" size={14} />
              </Link>
            }
          >
            {coverageAreas.length === 0 ? (
              <DashboardEmptyState
                compact
                icon={MapPinned}
                title="No demo zones selected"
                description="Add a broad sample zone on the coverage page to preview this summary."
              />
            ) : (
              <ul
                className="grid gap-2 sm:grid-cols-2"
                aria-label="Selected fictional coverage zones"
              >
                {coverageAreas.map((area) => (
                  <li
                    key={area}
                    className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-midnight/10 bg-[#f8faf7] px-3.5 py-2.5"
                  >
                    <MapPinned aria-hidden="true" size={16} className="shrink-0 text-midnight/55" />
                    <span className="min-w-0 break-words text-sm font-medium text-midnight">
                      {area}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Weekly availability summary"
            description="A local preference preview only. It does not indicate live availability or accept bookings."
            icon={CalendarDays}
            action={
              <Link className={inlineLinkClassName} href="/technician/availability">
                Manage times <ArrowRight aria-hidden="true" size={14} />
              </Link>
            }
          >
            {availableDays.length === 0 ? (
              <DashboardEmptyState
                compact
                icon={CalendarDays}
                title="No sample days selected"
                description="Choose days on the availability page to see the weekly preview."
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sample weekly availability">
                {availableDays.map(({ id, label }) => (
                  <li
                    key={id}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-midnight/10 bg-[#f8faf7] px-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-midnight">{label}</span>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs tabular-nums text-midnight/65">
                      {availability[id].start}–{availability[id].end}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

        <div className="grid min-w-0 gap-5">
          <DashboardCard
            title="Illustrative work history"
            description="Examples only—not jobs assigned to or completed by a real technician."
            icon={BriefcaseBusiness}
            action={
              <Link className={inlineLinkClassName} href="/technician/jobs">
                Full preview <ArrowRight aria-hidden="true" size={14} />
              </Link>
            }
          >
            <DashboardEmptyState
              compact
              icon={ClipboardList}
              title="No live jobs are connected"
              description="The entries below are fictional examples of completed and cancelled status layouts."
            />
            <ol className="mt-4 grid gap-3">
              {DEMO_TECHNICIAN_JOBS.slice(0, 3).map((job) => (
                <li
                  key={job.id}
                  className="flex min-w-0 items-start gap-3 rounded-xl border border-midnight/10 bg-white p-3.5"
                >
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
                    <BriefcaseBusiness aria-hidden="true" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-words text-sm font-semibold text-midnight">
                        {job.service}
                      </p>
                      <TechnicianJobStatusBadge status={job.status} />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-midnight/55">
                      {formatTechnicianDemoDate(job.date)} · {job.reference}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-midnight/65">{job.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          </DashboardCard>

          <DashboardCard
            title="Sample earnings overview"
            description="Fictional completed-job amounts; not actual earnings, balances or payments."
            icon={BarChart3}
            action={
              <Link className={inlineLinkClassName} href="/technician/earnings">
                Review examples <ArrowRight aria-hidden="true" size={14} />
              </Link>
            }
          >
            <div className="rounded-2xl bg-midnight p-5 text-white sm:p-6">
              <p className="text-xs font-medium text-white/65">Example completed-job total</p>
              <p className="mt-2 break-words text-3xl font-semibold tracking-tight text-white">
                {formatDemoRupees(sampleWorkValue)}
              </p>
              <p className="mt-2 text-xs leading-5 text-white/65">
                Fictional figure only · no funds are due or tracked.
              </p>
            </div>
            <p className="mt-4 text-xs leading-5 text-midnight/55">
              {DEMO_EARNINGS_TRANSACTIONS.length} fictional example rows · No payment or banking
              connection.
            </p>
          </DashboardCard>

          <DashboardCard
            title="Future verification stages"
            description="Only a status-layout preview; no documents or sensitive data are collected."
            icon={ShieldCheck}
            action={
              <Link className={inlineLinkClassName} href="/technician/verification">
                View stages <ArrowRight aria-hidden="true" size={14} />
              </Link>
            }
          >
            <ul className="grid gap-2">
              {DEMO_VERIFICATION_STAGES.slice(0, 3).map((stage) => (
                <li key={stage.id} className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`grid size-8 shrink-0 place-items-center rounded-full ${stage.status === 'Demo information' ? 'bg-lime/70 text-midnight' : 'bg-[#f1f3f5] text-midnight/55'}`}
                  >
                    {stage.status === 'Demo information' ? (
                      <Check size={15} />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium text-midnight">
                      {stage.title}
                    </span>
                    <span className="block text-xs text-midnight/55">{stage.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </DashboardCard>
        </div>
      </div>

      <DashboardCard
        title="Quick navigation"
        description="Explore each part of this technician UI preview. Changes are session-only and reset when the page is refreshed."
        className="mt-5"
        icon={ArrowRight}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overviewLinks.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-[96px] min-w-0 items-start gap-3 rounded-2xl border border-midnight/10 bg-[#f8faf7] p-4 transition-colors hover:border-midnight/20 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-midnight shadow-sm group-hover:bg-lime">
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold text-midnight">
                  {title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-midnight/60">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </DashboardCard>
    </>
  );
}

type SummaryTileProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  action: string;
};

function SummaryTile({ icon: Icon, eyebrow, title, detail, href, action }: SummaryTileProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-midnight/10 bg-white p-4 shadow-[0_8px_30px_rgba(16,24,39,0.025)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-midnight/50">
          {eyebrow}
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
          <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 break-words text-lg font-semibold leading-6 tracking-tight text-midnight">
        {title}
      </p>
      <p className="mt-1 min-h-10 break-words text-xs leading-5 text-midnight/60">{detail}</p>
      <Link className={`${inlineLinkClassName} -ml-2 mt-2`} href={href}>
        {action} <ArrowRight aria-hidden="true" size={14} />
      </Link>
    </article>
  );
}
