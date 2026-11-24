'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  ClipboardList,
  House,
  LayoutDashboard,
  MapPinned,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Brand } from '@/components/shared/Brand';
import { DemoDataNotice } from '@/features/dashboard/components/DemoDataNotice';
import { useDashboardDemo } from '@/features/dashboard/context/DashboardDemoContext';

const dashboardLinks = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Profile', href: '/dashboard/profile', icon: UserRound },
  { label: 'Addresses', href: '/dashboard/addresses', icon: MapPinned },
  { label: 'Service activity', href: '/dashboard/activity', icon: ClipboardList },
  { label: 'HomePassport', href: '/dashboard/homepassport', icon: House },
  { label: 'Warranties', href: '/dashboard/warranties', icon: ShieldCheck },
] as const;

type DashboardShellProps = {
  children: ReactNode;
};

type DashboardNavigationProps = {
  pathname: string;
  onNavigate?: () => void;
  id?: string;
  label: string;
};

function DashboardNavigation({ pathname, onNavigate, id, label }: DashboardNavigationProps) {
  return (
    <nav id={id} aria-label={label}>
      <ul className="grid gap-1.5">
        {dashboardLinks.map(({ label: itemLabel, href, icon: Icon }) => {
          const active = pathname === href;

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none ${active ? 'bg-midnight text-white shadow-sm' : 'text-midnight/65 hover:bg-midnight/[0.05] hover:text-midnight'}`}
              >
                <Icon
                  aria-hidden="true"
                  size={18}
                  strokeWidth={1.8}
                  className={active ? 'text-lime' : 'text-midnight/50 group-hover:text-midnight'}
                />
                {itemLabel}
                {active ? (
                  <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-lime" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const { profile } = useDashboardDemo();

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  const closeMobileNavigation = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-[#f8faf7] text-midnight">
      <a href="#dashboard-main" className="skip-link">
        Skip to dashboard content
      </a>
      <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-midnight/10 bg-white px-4 py-6 lg:flex xl:px-5">
          <div className="px-2">
            <Brand />
            <p className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-midnight/45">
              Customer workspace
            </p>
          </div>
          <div className="mt-7">
            <DashboardNavigation pathname={pathname} label="Customer dashboard" />
          </div>
          <div className="mt-auto rounded-2xl border border-midnight/10 bg-[#f8faf7] p-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-midnight/45">
              Demo profile
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-midnight">{profile.fullName}</p>
            <p className="mt-1 text-xs leading-5 text-midnight/55">Session-only sample details</p>
            <Link
              href="/"
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-semibold text-midnight/70 underline decoration-midnight/20 underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              Back to FixNear <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-3 border-b border-midnight/8 bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
            <Brand />
            <button
              ref={triggerRef}
              type="button"
              aria-label={mobileOpen ? 'Close dashboard navigation' : 'Open dashboard navigation'}
              aria-expanded={mobileOpen}
              aria-controls={mobileOpen ? 'dashboard-mobile-navigation' : undefined}
              onClick={() => setMobileOpen((open) => !open)}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-midnight/12 text-midnight transition-colors hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
            >
              {mobileOpen ? (
                <X aria-hidden="true" size={19} />
              ) : (
                <Menu aria-hidden="true" size={19} />
              )}
            </button>
          </header>

          <header className="hidden min-h-[76px] items-center justify-between border-b border-midnight/8 bg-white px-8 lg:flex xl:px-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-midnight/45">
                Customer workspace
              </p>
              <p className="mt-1 text-sm font-semibold text-midnight">
                A clearer view of home care
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-midnight/10 bg-[#f8faf7] px-3 py-2 text-xs font-medium text-midnight/65">
                <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
                Local demo
              </span>
              <Link
                href="/services"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-midnight/70 transition-colors hover:bg-midnight/[0.05] hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
              >
                Explore services <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </header>

          <main
            id="dashboard-main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1540px] px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10"
          >
            <DemoDataNotice />
            {children}
          </main>

          <footer className="border-t border-midnight/8 bg-white px-4 py-5 text-center text-xs leading-5 text-midnight/50 sm:px-6 lg:px-8">
            FixNear demo workspace · No real account, address or service record is connected.
          </footer>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobileOpen ? (
          <motion.div
            key="dashboard-mobile-drawer"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <button
              type="button"
              aria-label="Close dashboard navigation"
              onClick={closeMobileNavigation}
              className="absolute inset-0 cursor-default bg-midnight/40"
            />
            <motion.aside
              initial={reducedMotion ? false : { x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="relative z-10 flex h-full w-[min(19rem,calc(100vw-2.5rem))] flex-col border-r border-midnight/10 bg-white p-4 shadow-2xl sm:p-5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-midnight/8 pb-4">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-midnight/45">
                    Customer workspace
                  </p>
                  <p className="mt-1 text-sm font-semibold text-midnight">{profile.fullName}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close dashboard navigation"
                  onClick={closeMobileNavigation}
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-midnight/12 text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <div className="mt-5">
                <DashboardNavigation
                  id="dashboard-mobile-navigation"
                  label="Customer dashboard mobile"
                  pathname={pathname}
                  onNavigate={closeMobileNavigation}
                />
              </div>
              <div className="mt-auto border-t border-midnight/8 pt-4">
                <Link
                  href="/"
                  onClick={closeMobileNavigation}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-midnight/70 focus-visible:outline-2 focus-visible:outline-midnight"
                >
                  Back to FixNear <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
