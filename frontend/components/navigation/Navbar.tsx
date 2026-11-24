'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Container } from '@/components/layout/Container';
import { Brand } from '@/components/shared/Brand';
import { Button } from '@/components/ui/Button';

const navigationItems = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'For technicians', href: '#for-technicians' },
] as const;

export function Navbar() {
  const [activeSection, setActiveSection] = useState('#home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  useEffect(() => {
    if (pathname !== '/' || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio);
        const currentSection = visibleSections[0]?.target.id;

        if (currentSection) setActiveSection(`#${currentSection}`);
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0.05, 0.2, 0.5] },
    );

    navigationItems.forEach(({ href }) => {
      const section = document.querySelector(href);
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const closeForDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    desktopQuery.addEventListener('change', closeForDesktop);

    return () => {
      window.removeEventListener('keydown', handleEscape);
      desktopQuery.removeEventListener('change', closeForDesktop);
    };
  }, [mobileOpen]);

  const homeAnchor = (anchor: string) => {
    if (isHomePage) return anchor;
    return anchor === '#services' ? '/services' : `/${anchor}`;
  };

  const closeMobileMenu = (href: string) => {
    setActiveSection(href);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-midnight/8 bg-white">
      <Container className="flex min-h-[76px] items-center justify-between gap-4">
        <Brand />

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {navigationItems.map(({ label, href }) => (
            <Link
              key={href}
              href={homeAnchor(href)}
              aria-current={isHomePage && activeSection === href ? 'location' : undefined}
              onClick={() => setActiveSection(href)}
              className={`relative inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${isHomePage && activeSection === href ? 'text-midnight' : 'text-midnight/65'}`}
            >
              {label}
              {isHomePage && activeSection === href && (
                <motion.span
                  layoutId="desktop-nav-indicator"
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-lime"
                  transition={{ duration: reducedMotion ? 0 : 0.22 }}
                />
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button href="/bookings" variant="secondary" size="small">
            My requests
          </Button>
          <Button href={homeAnchor('#services')} size="small" className="gap-1.5">
            Get started
            <ArrowUpRight aria-hidden="true" size={16} />
          </Button>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          aria-controls={mobileOpen ? 'mobile-navigation' : undefined}
          onClick={() => setMobileOpen((open) => !open)}
          className="grid size-11 place-items-center rounded-xl border border-midnight/12 text-midnight transition hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight active:scale-95 motion-reduce:active:scale-100 lg:hidden"
        >
          {mobileOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        </button>
      </Container>

      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            id="mobile-navigation"
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="absolute inset-x-0 top-full border-b border-midnight/10 bg-white shadow-lg shadow-midnight/5 lg:hidden"
          >
            <Container className="py-4">
              <nav aria-label="Mobile navigation" className="grid gap-1">
                {navigationItems.map(({ label, href }) => (
                  <Link
                    key={href}
                    href={homeAnchor(href)}
                    aria-current={isHomePage && activeSection === href ? 'location' : undefined}
                    onClick={() => closeMobileMenu(href)}
                    className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-base font-medium transition-colors hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight ${isHomePage && activeSection === href ? 'bg-[#f4f6f8] text-midnight' : 'text-midnight/75'}`}
                  >
                    {label}
                    {isHomePage && activeSection === href && (
                      <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
                    )}
                  </Link>
                ))}
                <div className="mt-3 grid grid-cols-2 items-start gap-3 border-t border-midnight/8 pt-4">
                  <Button
                    href="/bookings"
                    variant="secondary"
                    size="small"
                    className="w-full"
                    onClick={() => closeMobileMenu('/bookings')}
                  >
                    My requests
                  </Button>
                  <Button
                    href={homeAnchor('#services')}
                    size="small"
                    className="w-full"
                    onClick={() => closeMobileMenu('#services')}
                  >
                    Get started
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </Button>
                </div>
              </nav>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
