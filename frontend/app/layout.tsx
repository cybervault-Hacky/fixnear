import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { CustomCursor } from '@/components/animation/CustomCursor';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'FixNear — Home repairs. Without the guesswork.',
    template: '%s | FixNear',
  },
  description:
    'A clearer way to understand home-repair estimates, approve changes, and keep service records. Starting in Pune, India.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={GeistSans.variable} data-scroll-behavior="smooth">
      <body>
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
