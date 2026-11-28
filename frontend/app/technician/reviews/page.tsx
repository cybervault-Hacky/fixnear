import type { Metadata } from 'next';

import { TechnicianReviewsPage } from '@/features/reviews/components/TechnicianReviewsPage';

export const metadata: Metadata = {
  title: 'Customer Reviews',
  description: 'Feedback from customers whose jobs you completed.',
};

export default function TechnicianReviewsRoute() {
  return <TechnicianReviewsPage />;
}
