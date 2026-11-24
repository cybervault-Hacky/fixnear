import { House, NotebookTabs } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { DemoApplianceCard } from '@/features/dashboard/components/DemoApplianceCard';
import { DEMO_APPLIANCES } from '@/features/dashboard/data/demo-data';

export function HomePassportPageContent() {
  return (
    <>
      <DashboardPageHeader
        eyebrow="HomePassport · product concept"
        title="A home record for the things you rely on."
        description="Explore how appliance type, brand, optional purchase dates, service notes and parts records could be organised. Every item below is fictional sample content."
      />

      <DashboardEmptyState
        icon={House}
        title="No real appliances are saved"
        description="This demonstration workspace is not connected to a customer account. The example appliance cards below show the kind of details HomePassport may hold."
      />

      <DashboardCard
        title="Illustrative appliance records"
        description="Open a sample card to inspect its service and parts history."
        icon={NotebookTabs}
        className="mt-5"
      >
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {DEMO_APPLIANCES.map((appliance) => (
            <DemoApplianceCard key={appliance.id} appliance={appliance} />
          ))}
        </div>
      </DashboardCard>
    </>
  );
}
