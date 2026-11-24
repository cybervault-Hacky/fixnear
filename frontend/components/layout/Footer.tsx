import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { Brand } from '@/components/shared/Brand';
import { ComingSoonButton } from '@/components/ui/ComingSoonButton';

const customerLinks = [
  { label: 'Explore services', href: '/services' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'PriceLock', href: '/#pricelock' },
  { label: 'HomePassport', href: '/#homepassport' },
];

const technicianLinks = [
  { label: 'For technicians', href: '/#for-technicians' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Service transparency', href: '/#transparency' },
];

export function Footer() {
  return (
    <footer className="bg-midnight text-white">
      <Container className="py-14 sm:py-16 lg:py-20">
        <div className="grid gap-12 border-b border-white/12 pb-12 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_1fr] lg:gap-10">
          <div className="max-w-sm">
            <Brand tone="light" />
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/65">
              A clearer way to plan home repairs, understand proposed work, and keep service records
              in one place.
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-white/45">
              Starting in Pune, India
            </p>
          </div>

          <FooterLinkGroup title="Customers" links={customerLinks} />
          <FooterLinkGroup title="Technicians" links={technicianLinks} />

          <div>
            <h2 className="text-sm font-semibold text-white">Account & legal</h2>
            <div className="mt-4">
              <ComingSoonButton
                variant="light"
                size="small"
                message="Customer accounts are not available in this preview."
              >
                Log in
              </ComingSoonButton>
            </div>
            <div className="mt-5 grid gap-2 text-sm text-white/65">
              <Link className="w-fit transition hover:text-white" href="#legal-note">
                Privacy <span className="text-xs text-white/40">· coming soon</span>
              </Link>
              <Link className="w-fit transition hover:text-white" href="#legal-note">
                Terms <span className="text-xs text-white/40">· coming soon</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-6 text-xs text-white/55 sm:flex-row sm:items-end sm:justify-between">
          <p>© {new Date().getFullYear()} FixNear. Home repairs. Without the guesswork.</p>
          <p id="legal-note" className="max-w-xl leading-5">
            Legal pages are not part of this preview. No account, booking, or payment action is
            completed here.
          </p>
          <Link
            href="/#home"
            aria-label="Back to top"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-medium text-white/75 transition hover:text-white focus-visible:outline-2 focus-visible:outline-lime"
          >
            Back to top <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </Container>
    </footer>
  );
}

type FooterLinkGroupProps = {
  title: string;
  links: readonly { label: string; href: string }[];
};

function FooterLinkGroup({ title, links }: FooterLinkGroupProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-4 grid gap-3">
        {links.map(({ label, href }) => (
          <li key={`${title}-${href}`}>
            <Link
              href={href}
              className="inline-flex min-h-7 items-center text-sm text-white/65 transition hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-lime"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
