import type { Metadata } from 'next';

import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/navigation/Navbar';
import { ServiceCatalog } from '@/features/services/components/ServiceCatalog';

export const metadata: Metadata = {
  title: 'Home Repair Service Guides',
  description:
    'Explore home-repair guides, search by service or common problem, and learn what a clear repair estimate may include.',
};

export default function ServicesPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <ServiceCatalog />
      <Footer />
    </>
  );
}
