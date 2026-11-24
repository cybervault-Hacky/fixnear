import type { PropsWithChildren } from 'react';

import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/layout/Container';
import { Navbar } from '@/components/navigation/Navbar';

type BookingFrameProps = PropsWithChildren<{
  narrow?: boolean;
}>;

export function BookingFrame({ children, narrow = false }: BookingFrameProps) {
  return (
    <>
      <a href="#booking-main" className="skip-link">
        Skip to booking content
      </a>
      <Navbar />
      <main
        id="booking-main"
        tabIndex={-1}
        className="min-h-[70vh] bg-[#f8faf7] py-8 outline-none sm:py-12"
      >
        <Container className={narrow ? 'max-w-[900px]' : 'max-w-[1240px]'}>{children}</Container>
      </main>
      <Footer />
    </>
  );
}
