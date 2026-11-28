'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  CalendarDays,
  Database,
  LayoutDashboard,
  MapPinned,
  Menu,
  ShieldCheck,
  Star,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Brand } from '@/components/shared/Brand';
import { TechnicianApiNotice } from '@/features/technician/components/TechnicianApiNotice';
import { TechnicianBookingNotice } from '@/features/bookings/components/TechnicianBookingNotice';
import { TechnicianDemoNotice } from '@/features/technician/components/TechnicianDemoNotice';
import { useTechnicianDemo } from '@/features/technician/context/TechnicianDemoContext';

const technicianLinks = [
  { label: 'Overview', href: '/technician', icon: LayoutDashboard },
  { label: 'Profile', href: '/technician/profile', icon: UserRound },
  { label: 'Services & skills', href: '/technician/services', icon: Wrench },
  { label: 'Service coverage', href: '/technician/coverage', icon: MapPinned },
  { label: 'Availability', href: '/technician/availability', icon: CalendarDays },
  { label: 'Bookings & quotes', href: '/technician/bookings', icon: ClipboardList },
  { label: 'Notifications', href: '/technician/notifications', icon: ClipboardList },
  { label: 'Work history', href: '/technician/jobs', icon: BriefcaseBusiness },
  { label: 'Earnings overview', href: '/technician/earnings', icon: BarChart3 },
  { label: 'Reviews', href: '/technician/reviews', icon: Star },
  { label: 'Verification stages', href: '/technician/verification', icon: ShieldCheck },
  { label: 'Database management', href: '/technician/manage', icon: Database },
] as const;

type TechnicianDashboardShellProps = {
  children: ReactNode;
};

type TechnicianNavigationProps = {
  pathname: string;
  label: string;
  id?: string;
  onNavigate?: () => void;
};

function TechnicianNavigation({ pathname, label, id, onNavigate }: TechnicianNavigationProps) {
  return (
    <nav id={id} aria-label={label}>
      <ul className="grid gap-1.5">
        {technicianLinks.map(({ label: itemLabel, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href === '/technician/bookings' && pathname.startsWith('/technician/bookings/'));

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

export function TechnicianDashboardShell({ children }: TechnicianDashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const isBookingTool = pathname.startsWith('/technician/bookings');
  const isApiManagement = pathname === '/technician/manage' || isBookingTool;
  const reducedMotion = useReducedMotion();
  const { profile } = useTechnicianDemo();

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
      <a href="#technician-main" className="skip-link">
        Skip to technician dashboard content
      </a>
      <div className="min-h-screen lg:grid lg:grid-cols-[258px_minmax(0,1fr)] xl:grid-cols-[278px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-midnight/10 bg-white px-4 py-6 lg:flex xl:px-5">
          <div className="px-2">
            <Brand />
            <p className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-midnight/45">
              Technician workspace
            </p>
          </div>
          <div className="mt-7">
            <TechnicianNavigation pathname={pathname} label="Technician dashboard" />
          </div>
          <div className="mt-auto rounded-2xl border border-midnight/10 bg-[#f8faf7] p-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-midnight/45">
              {isApiManagement ? 'Protected technician tools' : 'Sample profile'}
            </p>
            {isApiManagement ? (
              <>
                <p className="mt-2 text-sm font-semibold text-midnight">
                  Authenticated technician role required
                </p>
                <p className="mt-1 text-xs leading-5 text-midnight/55">
                  No sample profile data is shown here.
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 truncate text-sm font-semibold text-midnight">
                  {profile.fullName}
                </p>
                <p className="mt-1 text-xs leading-5 text-midnight/55">Fictional · session-only</p>
              </>
            )}
            <Link
              href={isApiManagement ? '/technician' : '/'}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-semibold text-midnight/70 underline decoration-midnight/20 underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              {isApiManagement ? 'Return to demo workspace' : 'Back to FixNear'}{' '}
              <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-3 border-b border-midnight/8 bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
            <Brand />
            <button
              ref={triggerRef}
              type="button"
              aria-label={mobileOpen ? 'Close technician navigation' : 'Open technician navigation'}
              aria-expanded={mobileOpen}
              aria-controls={mobileOpen ? 'technician-mobile-navigation' : undefined}
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
                {isApiManagement ? 'Private technician tools' : 'Technician workspace'}
              </p>
              <p className="mt-1 text-sm font-semibold text-midnight">
                {isBookingTool
                  ? 'Database-backed bookings & PriceLock · technician role required'
                  : isApiManagement
                    ? 'Database-backed profile · authenticated role required'
                    : 'A sample workspace · no live technician account'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-midnight/10 bg-[#f8faf7] px-3 py-2 text-xs font-medium text-midnight/65">
                <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
                {isApiManagement ? 'Protected API' : 'Demo only'}
              </span>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-midnight/70 transition-colors hover:bg-midnight/[0.05] hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none"
              >
                FixNear home <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </header>

          <main
            id="technician-main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1540px] px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10"
          >
            {isBookingTool ? (
              <TechnicianBookingNotice />
            ) : isApiManagement ? (
              <TechnicianApiNotice />
            ) : (
              <TechnicianDemoNotice />
            )}
            {children}
          </main>

          <footer className="border-t border-midnight/8 bg-white px-4 py-5 text-center text-xs leading-5 text-midnight/50 sm:px-6 lg:px-8">
            {isBookingTool
              ? 'FixNear booking tools · assignment is admin-controlled, requested times are not availability, and this interface does not process payments.'
              : isApiManagement
                ? 'FixNear technician API tools · Private account data is access-controlled; availability preferences are not live appointments.'
                : 'FixNear technician preview · No registration, live work, verification, or payment is connected.'}
          </footer>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobileOpen ? (
          <motion.div
            key="technician-mobile-drawer"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <button
              type="button"
              aria-label="Close technician navigation"
              onClick={closeMobileNavigation}
              className="absolute inset-0 cursor-default bg-midnight/40"
            />
            <motion.aside
              initial={reducedMotion ? false : { x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="relative z-10 flex h-full w-[min(20rem,calc(100vw-2.5rem))] flex-col border-r border-midnight/10 bg-white p-4 shadow-2xl sm:p-5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-midnight/8 pb-4">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-midnight/45">
                    {isApiManagement ? 'Private technician tools' : 'Technician workspace'}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-midnight">
                    {isApiManagement ? 'Authenticated technician role required' : profile.fullName}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close technician navigation"
                  onClick={closeMobileNavigation}
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-midnight/12 text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <div className="mt-5 overflow-y-auto">
                <TechnicianNavigation
                  id="technician-mobile-navigation"
                  label="Technician dashboard mobile"
                  pathname={pathname}
                  onNavigate={closeMobileNavigation}
                />
              </div>
              <div className="mt-auto border-t border-midnight/8 pt-4">
                <Link
                  href={isApiManagement ? '/technician' : '/'}
                  onClick={closeMobileNavigation}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-midnight/70 focus-visible:outline-2 focus-visible:outline-midnight"
                >
                  {isApiManagement ? 'Return to demo workspace' : 'Back to FixNear'}{' '}
                  <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
