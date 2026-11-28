import type { Metadata } from 'next';
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter';
export const metadata: Metadata = { title: 'Notifications' };
export default function TechnicianNotificationsPage() {
  return <NotificationCenter />;
}
