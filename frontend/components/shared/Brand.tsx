import Link from 'next/link';
import { House } from 'lucide-react';

type BrandProps = {
  tone?: 'dark' | 'light';
};

export function Brand({ tone = 'dark' }: BrandProps) {
  return (
    <Link
      href="/"
      aria-label="FixNear home"
      className={`inline-flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 ${tone === 'light' ? 'text-white focus-visible:outline-lime' : 'text-midnight focus-visible:outline-midnight'}`}
    >
      <span className="grid size-10 place-items-center rounded-xl bg-lime text-midnight">
        <House aria-hidden="true" size={21} strokeWidth={2.25} />
      </span>
      <span className="text-[1.3rem] font-semibold tracking-[-0.055em]">
        Fix<span className={tone === 'light' ? 'text-white/65' : 'text-midnight/55'}>Near</span>
      </span>
    </Link>
  );
}
