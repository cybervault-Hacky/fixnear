'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  cloneDemoAvailability,
  DEMO_TECHNICIAN_COVERAGE_AREAS,
  DEMO_TECHNICIAN_PROFILE,
  DEMO_TECHNICIAN_SERVICES,
  DEMO_WEEKLY_AVAILABILITY,
} from '@/features/technician/data/demo-data';
import type {
  TechnicianProfile,
  TechnicianServiceSkill,
  WeeklyAvailability,
} from '@/features/technician/types/technician';

type TechnicianDemoContextValue = {
  profile: TechnicianProfile;
  services: readonly TechnicianServiceSkill[];
  coverageAreas: readonly string[];
  availability: WeeklyAvailability;
  saveProfile: (profile: TechnicianProfile) => void;
  saveServices: (services: readonly TechnicianServiceSkill[]) => void;
  saveCoverageAreas: (areas: readonly string[]) => void;
  saveAvailability: (availability: WeeklyAvailability) => void;
};

const TechnicianDemoContext = createContext<TechnicianDemoContextValue | null>(null);

type TechnicianDemoProviderProps = {
  children: ReactNode;
};

export function TechnicianDemoProvider({ children }: TechnicianDemoProviderProps) {
  const [profile, setProfile] = useState<TechnicianProfile>(() => ({
    ...DEMO_TECHNICIAN_PROFILE,
  }));
  const [services, setServices] = useState<TechnicianServiceSkill[]>(() =>
    DEMO_TECHNICIAN_SERVICES.map((service) => ({ ...service })),
  );
  const [coverageAreas, setCoverageAreas] = useState<string[]>(() => [
    ...DEMO_TECHNICIAN_COVERAGE_AREAS,
  ]);
  const [availability, setAvailability] = useState<WeeklyAvailability>(() =>
    cloneDemoAvailability(DEMO_WEEKLY_AVAILABILITY),
  );

  const saveProfile = useCallback((nextProfile: TechnicianProfile) => {
    setProfile({
      fullName: nextProfile.fullName.trim(),
      email: nextProfile.email.trim(),
      phone: nextProfile.phone.trim(),
      professionalDescription: nextProfile.professionalDescription.trim(),
      yearsExperience: nextProfile.yearsExperience.trim(),
    });
  }, []);

  const saveServices = useCallback((nextServices: readonly TechnicianServiceSkill[]) => {
    setServices(nextServices.map((service) => ({ ...service })));
  }, []);

  const saveCoverageAreas = useCallback((nextAreas: readonly string[]) => {
    setCoverageAreas([...new Set(nextAreas)]);
  }, []);

  const saveAvailability = useCallback((nextAvailability: WeeklyAvailability) => {
    setAvailability(cloneDemoAvailability(nextAvailability));
  }, []);

  const value = useMemo(
    () => ({
      profile,
      services,
      coverageAreas,
      availability,
      saveProfile,
      saveServices,
      saveCoverageAreas,
      saveAvailability,
    }),
    [
      profile,
      services,
      coverageAreas,
      availability,
      saveProfile,
      saveServices,
      saveCoverageAreas,
      saveAvailability,
    ],
  );

  return <TechnicianDemoContext.Provider value={value}>{children}</TechnicianDemoContext.Provider>;
}

export function useTechnicianDemo() {
  const context = useContext(TechnicianDemoContext);
  if (!context) {
    throw new Error('useTechnicianDemo must be used within TechnicianDemoProvider.');
  }
  return context;
}
