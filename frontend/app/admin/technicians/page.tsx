import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { Brand } from '@/components/shared/Brand';
import { AdminTechnicianReviewPage } from '@/features/admin/components/AdminTechnicianReviewPage';

export const metadata: Metadata = {
  title: 'Admin Technician Review',
  description: 'Review and decide pending technician verification submissions.',
};

export default function AdminTechniciansRoute() {
  return (
    <div className="min-h-screen bg-[#f8faf7] text-midnight">
      <a href="#admin-content" className="skip-link">
        Skip to admin content
      </a>
      <header className="border-b border-midnight/8 bg-white">
        <Container className="flex min-h-[68px] flex-wrap items-center justify-between gap-2 py-3">
          <Brand />
          <nav
            aria-label="Admin tools"
            className="flex flex-wrap items-center justify-end gap-1 sm:gap-2"
          >
            <Link
              href="/admin/bookings"
              className="min-h-10 rounded-lg px-3 py-2 text-xs font-semibold text-midnight/70 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight sm:text-sm"
            >
              Booking oversight
            </Link>
            <Link
              href="/admin/service-catalog"
              className="min-h-10 rounded-lg px-3 py-2 text-xs font-semibold text-midnight/70 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight sm:text-sm"
            >
              Service catalog
            </Link>
            <Link
              href="/services"
              className="min-h-10 rounded-lg px-3 py-2 text-xs font-semibold text-midnight/70 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-midnight sm:text-sm"
            >
              Public guides
            </Link>
          </nav>
        </Container>
      </header>
      <main
        id="admin-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1600px] px-4 py-7 outline-none sm:px-6 sm:py-9 lg:px-8"
      >
        <AdminTechnicianReviewPage />
      </main>
      <footer className="border-t border-midnight/8 bg-white px-4 py-5 text-center text-xs leading-5 text-midnight/50">
        FixNear admin tools · private technician information · admin role required
      </footer>
    </div>
  );
}
