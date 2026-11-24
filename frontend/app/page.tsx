import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/navigation/Navbar';
import { FinalCtaSection } from '@/features/home/FinalCtaSection';
import { HomePassportSection } from '@/features/home/HomePassportSection';
import { HowItWorksSection } from '@/features/home/HowItWorksSection';
import { PriceLockSection } from '@/features/home/PriceLockSection';
import { ServiceExplorer } from '@/features/home/ServiceExplorer';
import { TechnicianSection } from '@/features/home/TechnicianSection';
import { TrustSection } from '@/features/home/TrustSection';

export default function HomePage() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content">
        <ServiceExplorer />
        <TrustSection />
        <PriceLockSection />
        <HomePassportSection />
        <HowItWorksSection />
        <TechnicianSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </>
  );
}
