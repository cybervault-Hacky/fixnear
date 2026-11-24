import { ClipboardList, Wrench, Zap, type LucideIcon } from 'lucide-react';

import { services } from '@/features/services/data/services';

export type ServiceCategory = {
  title: string;
  description: string;
  keywords: readonly string[];
  icon: LucideIcon;
};

export const serviceCategories: readonly ServiceCategory[] = services.map((service) => ({
  title: service.homeTitle,
  description: service.homeDescription,
  keywords: service.keywords,
  icon: service.icon,
}));

export const transparencyPrinciples = [
  {
    number: '01',
    title: 'Understand the estimate',
    description:
      'See the proposed work and its line items before deciding how you want to proceed.',
    icon: Wrench,
  },
  {
    number: '02',
    title: 'Approve scope changes',
    description:
      'If a repair needs more work than first described, the change should be explained and approved by you first.',
    icon: Zap,
  },
  {
    number: '03',
    title: 'Keep a service record',
    description:
      'Save useful notes, service dates and warranty details so your home-maintenance history is easier to follow.',
    icon: ClipboardList,
  },
] as const;

export const howItWorksSteps = [
  {
    number: '01',
    title: 'Choose a service',
    description: 'Start with the appliance or home service that needs attention.',
  },
  {
    number: '02',
    title: 'Describe the problem',
    description: 'Share the symptoms and any details that can help explain the issue.',
  },
  {
    number: '03',
    title: 'Review an estimate',
    description: 'Understand the proposed work and the items included before deciding.',
  },
  {
    number: '04',
    title: 'Approve the work',
    description: 'Move forward with the agreed scope; additional work needs your approval.',
  },
  {
    number: '05',
    title: 'Track completion',
    description: 'Keep service notes and relevant warranty information with your home record.',
  },
] as const;
