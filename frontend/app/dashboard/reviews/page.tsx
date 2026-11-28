import type { Metadata } from 'next';

import { CustomerReviewsPage } from '@/features/reviews/components/CustomerReviewsPage';

export const metadata: Metadata = {
  title: 'My Reviews',
  description: 'Review completed FixNear jobs and edit your recent feedback.',
};

export default function DashboardReviewsPage() {
  return <CustomerReviewsPage />;
}
