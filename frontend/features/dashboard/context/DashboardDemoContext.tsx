'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DEMO_ADDRESSES, DEMO_PROFILE } from '@/features/dashboard/data/demo-data';
import type {
  DashboardAddress,
  DashboardAddressInput,
  ProfileDetails,
} from '@/features/dashboard/types/dashboard';

type DashboardDemoContextValue = {
  profile: ProfileDetails;
  addresses: readonly DashboardAddress[];
  updateProfile: (profile: ProfileDetails) => void;
  saveAddress: (address: DashboardAddressInput) => void;
  deleteAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
};

const DashboardDemoContext = createContext<DashboardDemoContextValue | null>(null);

type DashboardDemoProviderProps = {
  children: ReactNode;
};

export function DashboardDemoProvider({ children }: DashboardDemoProviderProps) {
  const [profile, setProfile] = useState<ProfileDetails>(() => ({ ...DEMO_PROFILE }));
  const [addresses, setAddresses] = useState<DashboardAddress[]>(() =>
    DEMO_ADDRESSES.map((address) => ({ ...address })),
  );

  const updateProfile = useCallback((nextProfile: ProfileDetails) => {
    setProfile({
      fullName: nextProfile.fullName.trim(),
      email: nextProfile.email.trim(),
      phone: nextProfile.phone.trim(),
    });
  }, []);

  const saveAddress = useCallback((input: DashboardAddressInput) => {
    const id = input.id ?? `demo-address-${Date.now()}`;
    const address: DashboardAddress = { ...input, id };

    setAddresses((current) => {
      const exists = current.some((item) => item.id === id);
      let next = exists
        ? current.map((item) => (item.id === id ? address : item))
        : [...current, address];

      if (address.isDefault || next.length === 1) {
        next = next.map((item) => ({ ...item, isDefault: item.id === id }));
      } else if (!next.some((item) => item.isDefault)) {
        next = next.map((item, index) => ({ ...item, isDefault: index === 0 }));
      }

      return next;
    });
  }, []);

  const deleteAddress = useCallback((id: string) => {
    setAddresses((current) => {
      const wasDefault = current.some((item) => item.id === id && item.isDefault);
      const next = current.filter((item) => item.id !== id);

      if (wasDefault && next.length > 0) {
        return next.map((item, index) => ({ ...item, isDefault: index === 0 }));
      }

      if (next.length > 0 && !next.some((item) => item.isDefault)) {
        return next.map((item, index) => ({ ...item, isDefault: index === 0 }));
      }

      return next;
    });
  }, []);

  const setDefaultAddress = useCallback((id: string) => {
    setAddresses((current) =>
      current.map((address) => ({ ...address, isDefault: address.id === id })),
    );
  }, []);

  const value = useMemo(
    () => ({ profile, addresses, updateProfile, saveAddress, deleteAddress, setDefaultAddress }),
    [profile, addresses, updateProfile, saveAddress, deleteAddress, setDefaultAddress],
  );

  return <DashboardDemoContext.Provider value={value}>{children}</DashboardDemoContext.Provider>;
}

export function useDashboardDemo() {
  const context = useContext(DashboardDemoContext);
  if (!context) {
    throw new Error('useDashboardDemo must be used within DashboardDemoProvider.');
  }
  return context;
}
