import type { PropsWithChildren } from 'react';
import Link from 'next/link';

import { Brand } from '@/components/shared/Brand';
import { Container } from '@/components/layout/Container';

type AdminBookingFrameProps = PropsWithChildren;

export function AdminBookingFrame({ children }: AdminBookingFrameProps) {
  return (
    <div className="min-h-screen bg-[#f8faf7] text-midnight">
      <a href="#admin-booking-main" className="skip-link">
        Skip to admin content
      </a>
      <header className="border-b border-midnight/8 bg-white">
        <Container className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 py-3">
          <Brand />
          <nav aria-label="Admin tools" className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Link
              href="/admin/bookings"
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-midnight/75 underline underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-midnight sm:text-sm"
            >
              Bookings
            </Link>
            <Link
              href="/admin/technicians"
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-midnight/75 underline underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-midnight sm:text-sm"
            >
              Technician review
            </Link>
            <Link
              href="/admin/service-catalog"
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-midnight/75 underline underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-midnight sm:text-sm"
            >
              Service catalog
            </Link>
          </nav>
        </Container>
      </header>
      <main
        id="admin-booking-main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1600px] px-4 py-7 outline-none sm:px-6 sm:py-9 lg:px-8"
      >
        {children}
      </main>
      <footer className="border-t border-midnight/8 bg-white px-4 py-5 text-center text-xs leading-5 text-midnight/50">
        FixNear admin tools · booking, customer, address, quote and audit details are restricted by
        the server-managed admin role.
      </footer>
    </div>
  );
}
