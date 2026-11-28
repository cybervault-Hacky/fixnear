import type { Metadata } from 'next';

import { SimulatedPaymentStatus } from '@/features/bookings/components/SimulatedPaymentStatus';

export const metadata: Metadata = { title: 'Simulated payment status' };

export default function SimulatedPaymentStatusRoute() {
  return <SimulatedPaymentStatus />;
}
