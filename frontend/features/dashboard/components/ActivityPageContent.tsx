import { CalendarClock, ClipboardList } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { DemoActivityCard } from '@/features/dashboard/components/DemoActivityCard';
import { DEMO_ACTIVITY } from '@/features/dashboard/data/demo-data';

export function ActivityPageContent() {
  return (
    <>
      <DashboardPageHeader
        eyebrow="Service activity · illustrative timeline"
        title="Service history, clearly laid out."
        description="Review example status summaries and service-note steps. This page does not create bookings or receive provider updates."
      />

      <DashboardEmptyState
        icon={CalendarClock}
        title="No real service activity is connected"
        description="There are no customer bookings, completed visits or live updates in this demo. The entries below are demonstration data only."
      />

      <DashboardCard
        title="Example activity history"
        description="Sample service descriptions, dates and status progress—not actual customer records."
        icon={ClipboardList}
        className="mt-5"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {DEMO_ACTIVITY.map((activity) => (
            <DemoActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      </DashboardCard>

      <p className="mt-5 rounded-xl border border-midnight/10 bg-white px-4 py-3 text-xs leading-5 text-midnight/55">
        Status labels and progress steps are static sample illustrations; they are not a workflow,
        appointment confirmation or live repair tracker.
      </p>
    </>
  );
}
