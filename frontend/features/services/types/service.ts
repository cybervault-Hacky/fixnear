import type { LucideIcon } from 'lucide-react';

export type ServiceGroup = string;

export type ServiceProblem = {
  title: string;
  description: string;
};

export type ServiceQuestion = {
  question: string;
  answer: string;
};

export type ServiceDefinition = {
  slug: string;
  title: string;
  homeTitle: string;
  homeDescription: string;
  group: ServiceGroup;
  description: string;
  listingDescription: string;
  keywords: readonly string[];
  icon: LucideIcon;
  problems: readonly ServiceProblem[];
  inclusions: readonly string[];
  relatedSlugs: readonly string[];
  questions: readonly ServiceQuestion[];
};
