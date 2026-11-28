'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  House,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  ScrollText,
  Star,
  Store,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { Brand } from '@/components/shared/Brand';
import { Container } from '@/components/layout/Container';

const NAV_SECTIONS: { label: string; href: string; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Bookings', href: '/admin/bookings', icon: ClipboardList },
  { label: 'Customers', href: '/admin/customers', icon: Users },
  { label: 'Technicians', href: '/admin/technicians', icon: Wrench },
  { label: 'Service Catalog', href: '/admin/service-catalog', icon: Store },
  { label: 'Reviews', href: '/admin/reviews', icon: Star },
  { label: 'Support', href: '/admin/support', icon: LifeBuoy },
  { label: 'HomePassport', href: '/admin/homepassport', icon: House },
  { label: 'Notification deliveries', href: '/admin/notification-deliveries', icon: ClipboardList },
  { label: 'Audit Logs', href: '/admin/audit', icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({
  pathname,
  onNavigate,
  id,
  label,
}: {
  pathname: string;
  onNavigate?: () => void;
  id?: string;
  label: string;
}) {
  return (
    <nav id={id} aria-label={label}>
      <ul className="grid gap-1.5">
        {NAV_SECTIONS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-midnight ${
                  active
                    ? 'bg-midnight text-white'
                    : 'text-midnight/75 hover:bg-midnight/6 hover:text-midnight'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8faf7] text-midnight">
      <a href="#admin-main" className="skip-link">
        Skip to admin content
      </a>
      <header className="border-b border-midnight/8 bg-white">
        <Container className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="hidden rounded-full border border-midnight/12 bg-[#f4f6f8] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight/60 sm:inline-flex">
              Admin
            </span>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-midnight/15 text-midnight lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            <span className="sr-only">Toggle admin navigation</span>
          </button>
        </Container>
        {menuOpen ? (
          <div
            id="admin-mobile-nav"
            className="border-t border-midnight/8 bg-white px-4 py-4 lg:hidden"
          >
            <Navigation
              pathname={pathname}
              label="Admin navigation"
              onNavigate={() => setMenuOpen(false)}
            />
            <Link
              href="/"
              className="mt-3 block rounded-xl px-3 py-2 text-xs font-semibold text-midnight/60 hover:text-midnight"
            >
              ← Back to FixNear
            </Link>
          </div>
        ) : null}
      </header>

      <Container className="grid gap-6 py-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-2xl border border-midnight/10 bg-white p-4">
            <Navigation pathname={pathname} label="Admin navigation" />
            <Link
              href="/"
              className="mt-4 block rounded-xl px-3 py-2 text-xs font-semibold text-midnight/60 hover:text-midnight"
            >
              ← Back to FixNear
            </Link>
          </div>
        </aside>
        <main id="admin-main" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </main>
      </Container>
      <footer className="border-t border-midnight/8 bg-white px-4 py-5 text-center text-xs leading-5 text-midnight/50">
        FixNear admin tools · all operations are restricted to the server-managed admin role and are
        recorded in the audit log.
      </footer>
    </div>
  );
}

export function AdminEmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-midnight/15 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-midnight">{title}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-midnight/55">{hint}</p> : null}
    </div>
  );
}

export function AdminErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-[#d99b93] bg-[#fff3f1] p-6 text-center">
      <p className="text-sm font-semibold text-[#8d3028]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[#d99b93] bg-white px-4 text-xs font-semibold text-[#8d3028] hover:bg-[#fdf0ee] focus-visible:outline-2 focus-visible:outline-midnight"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function AdminLoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-40 items-center justify-center rounded-2xl border border-midnight/10 bg-white p-8 text-sm text-midnight/60"
    >
      {label}
    </div>
  );
}
