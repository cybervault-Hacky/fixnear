'use client';

import { ArrowRight, ClipboardList, House, MapPinned, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { DemoActivityCard } from '@/features/dashboard/components/DemoActivityCard';
import { DemoApplianceCard } from '@/features/dashboard/components/DemoApplianceCard';
import { DemoWarrantyCard } from '@/features/dashboard/components/DemoWarrantyCard';
import {
  DEMO_ACTIVITY,
  DEMO_APPLIANCES,
  DEMO_WARRANTIES,
} from '@/features/dashboard/data/demo-data';
import { useDashboardDemo } from '@/features/dashboard/context/DashboardDemoContext';

const quickLinks = [
  {
    title: 'Profile details',
    description: 'Review and edit this session’s sample profile.',
    href: '/dashboard/profile',
    icon: UserRound,
  },
  {
    title: 'Saved addresses',
    description: 'Manage fictional demo address cards.',
    href: '/dashboard/addresses',
    icon: MapPinned,
  },
  {
    title: 'Service activity',
    description: 'Explore example service-history statuses.',
    href: '/dashboard/activity',
    icon: ClipboardList,
  },
  {
    title: 'HomePassport',
    description: 'View sample appliances and parts history.',
    href: '/dashboard/homepassport',
    icon: House,
  },
  {
    title: 'Warranties',
    description: 'Review sample dates and provider-term notes.',
    href: '/dashboard/warranties',
    icon: ShieldCheck,
  },
] as const;

const linkClassName =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/70 transition-colors hover:bg-midnight/[0.04] hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none';

export function DashboardOverview() {
  const { profile, addresses } = useDashboardDemo();
  const firstName = profile.fullName.trim().split(/\s+/)[0] || 'there';

  return (
    <>
      <DashboardPageHeader
        eyebrow="Customer dashboard · demonstration"
        title={`Welcome, ${firstName}.`}
        description="A single place to explore profile details, service activity, appliance records and warranty notes. Everything shown here is sample data, not a live customer account."
        action={
          <Button href="/dashboard/profile" variant="secondary" size="small">
            Edit demo profile <ArrowRight aria-hidden="true" size={15} />
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={UserRound}
          eyebrow="Profile summary"
          title={profile.fullName || 'Demo profile'}
          detail={profile.email || 'No demo email entered'}
          href="/dashboard/profile"
          action="Review profile"
        />
        <SummaryTile
          icon={ClipboardList}
          eyebrow="Service activity"
          title={`${DEMO_ACTIVITY.length} example entries`}
          detail="No bookings or live updates are connected."
          href="/dashboard/activity"
          action="View examples"
        />
        <SummaryTile
          icon={House}
          eyebrow="HomePassport"
          title={`${DEMO_APPLIANCES.length} sample appliances`}
          detail="Illustrative service and parts history."
          href="/dashboard/homepassport"
          action="View examples"
        />
        <SummaryTile
          icon={ShieldCheck}
          eyebrow="Warranty notes"
          title={`${DEMO_WARRANTIES.length} sample records`}
          detail="Example dates do not confirm coverage."
          href="/dashboard/warranties"
          action="Review notes"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        <DashboardCard
          title="Recent activity preview"
          description="Illustrative entries only; none represents an actual booking or service update."
          icon={ClipboardList}
          action={
            <Link className={linkClassName} href="/dashboard/activity">
              All activity <ArrowRight aria-hidden="true" size={14} />
            </Link>
          }
        >
          <DashboardEmptyState
            compact
            icon={ClipboardList}
            title="No live service history is connected"
            description="The examples below demonstrate how sample activity could appear in a customer dashboard."
          />
          <div className="mt-4 grid gap-3">
            {DEMO_ACTIVITY.slice(0, 2).map((activity) => (
              <DemoActivityCard key={activity.id} activity={activity} compact />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Profile summary"
          description="Session-only sample values; this dashboard is not linked to an account."
          icon={UserRound}
          action={
            <Link className={linkClassName} href="/dashboard/profile">
              Edit <ArrowRight aria-hidden="true" size={14} />
            </Link>
          }
        >
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <ProfileSummaryItem
              label="Name"
              value={profile.fullName || 'Not provided in this demo'}
            />
            <ProfileSummaryItem
              label="Email"
              value={profile.email || 'Not provided in this demo'}
            />
            <ProfileSummaryItem
              label="Phone"
              value={profile.phone || 'Not provided in this demo'}
            />
            <ProfileSummaryItem
              label="Saved addresses"
              value={`${addresses.length} fictional demo ${addresses.length === 1 ? 'address' : 'addresses'}`}
            />
          </dl>
        </DashboardCard>
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
        <DashboardCard
          title="HomePassport preview"
          description="Sample appliance entries with example purchase dates and histories."
          icon={House}
          action={
            <Link className={linkClassName} href="/dashboard/homepassport">
              All appliances <ArrowRight aria-hidden="true" size={14} />
            </Link>
          }
        >
          <DashboardEmptyState
            compact
            icon={House}
            title="No real appliances are stored"
            description="These clearly marked demo cards are not customer-owned appliance records."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {DEMO_APPLIANCES.map((appliance) => (
              <DemoApplianceCard key={appliance.id} appliance={appliance} compact />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Warranty summary"
          description="Status colours are based on the demonstration dates shown."
          icon={ShieldCheck}
          action={
            <Link className={linkClassName} href="/dashboard/warranties">
              All warranty notes <ArrowRight aria-hidden="true" size={14} />
            </Link>
          }
        >
          <DashboardEmptyState
            compact
            icon={ShieldCheck}
            title="No live warranty information is connected"
            description="The sample records below do not promise that any item is covered."
          />
          <div className="mt-4 grid gap-3">
            {DEMO_WARRANTIES.map((warranty) => (
              <DemoWarrantyCard key={warranty.id} warranty={warranty} compact />
            ))}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard
        title="Quick navigation"
        description="Jump to a part of the customer workspace. Changes are session-only and are not persisted."
        className="mt-5"
        icon={ArrowRight}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-[96px] min-w-0 items-start gap-3 rounded-2xl border border-midnight/10 bg-[#f8faf7] p-4 transition-colors hover:border-midnight/20 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-midnight shadow-sm group-hover:bg-lime">
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-midnight">{title}</span>
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
  icon: typeof UserRound;
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
      <p className="mt-1 min-h-10 text-xs leading-5 text-midnight/60">{detail}</p>
      <Link className={`${linkClassName} mt-2 -ml-2`} href={href}>
        {action} <ArrowRight aria-hidden="true" size={14} />
      </Link>
    </article>
  );
}

type ProfileSummaryItemProps = {
  label: string;
  value: string;
};

function ProfileSummaryItem({ label, value }: ProfileSummaryItemProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-midnight/50">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-midnight">{value}</dd>
    </div>
  );
}
