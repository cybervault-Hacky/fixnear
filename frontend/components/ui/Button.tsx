import Link from 'next/link';
import type { MouseEventHandler, PropsWithChildren } from 'react';

type ButtonProps = PropsWithChildren<{
  href: string;
  variant?: 'primary' | 'secondary' | 'lime' | 'light';
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}>;

const variants = {
  primary: 'bg-midnight text-white hover:bg-[#1d2a3f] focus-visible:outline-lime',
  secondary:
    'border border-midnight/15 bg-white text-midnight hover:border-midnight/30 hover:bg-[#f7f9fb] focus-visible:outline-midnight',
  lime: 'bg-lime text-midnight hover:bg-[#c8efa4] focus-visible:outline-midnight',
  light: 'bg-white text-midnight hover:bg-[#f1f4f7] focus-visible:outline-white',
} as const;

const sizes = {
  small: 'min-h-10 px-4 text-sm',
  medium: 'min-h-12 px-5 text-sm sm:text-base',
  large: 'min-h-14 px-6 text-base',
} as const;

export function Button({
  href,
  variant = 'primary',
  size = 'medium',
  className = '',
  onClick,
  children,
}: ButtonProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-3 motion-reduce:transition-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </Link>
  );
}
