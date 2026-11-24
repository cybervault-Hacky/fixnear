import { FileCheck2, ShieldCheck } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { DemoWarrantyCard } from '@/features/dashboard/components/DemoWarrantyCard';
import {
  DEMO_STATUS_AS_OF,
  DEMO_WARRANTIES,
  formatDemoDate,
} from '@/features/dashboard/data/demo-data';

export function WarrantiesPageContent() {
  return (
    <>
      <DashboardPageHeader
        eyebrow="Warranty notes · demonstration data"
        title="Keep the terms alongside the record."
        description="Review sample providers, covered items, date ranges and notes. Actual warranty terms and eligibility are determined only by the responsible provider."
      />

      <DashboardEmptyState
        icon={ShieldCheck}
        title="No live warranty records are connected"
        description="The cards below are fictional examples used to show active and expired sample-date states. They do not promise that any product or repair is covered."
      />

      <DashboardCard
        title="Illustrative warranty records"
        description={`Sample status date: ${formatDemoDate(DEMO_STATUS_AS_OF)}. Statuses reflect these example dates only.`}
        icon={FileCheck2}
        className="mt-5"
      >
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {DEMO_WARRANTIES.map((warranty) => (
            <DemoWarrantyCard key={warranty.id} warranty={warranty} />
          ))}
        </div>
      </DashboardCard>

      <aside className="mt-5 rounded-2xl border border-midnight/10 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-midnight">
          Warranty information is not a coverage decision
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-midnight/65">
          Keep the original document and contact the issuing provider to confirm inclusions,
          exclusions, transfer rules, claim steps and expiry. FixNear does not validate, extend or
          guarantee warranties in this frontend demonstration.
        </p>
      </aside>
    </>
  );
}
