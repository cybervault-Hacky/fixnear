import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type DashboardActionButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  }
>;

const variants = {
  primary:
    'bg-midnight text-white hover:bg-[#1d2a3f] focus-visible:outline-lime disabled:bg-midnight/35',
  secondary:
    'border border-midnight/15 bg-white text-midnight hover:border-midnight/30 hover:bg-[#f7f9fb] focus-visible:outline-midnight disabled:text-midnight/40',
  quiet:
    'bg-transparent text-midnight/70 hover:bg-midnight/[0.05] hover:text-midnight focus-visible:outline-midnight disabled:text-midnight/35',
  danger:
    'bg-[#fff3f1] text-[#943329] hover:bg-[#ffe7e3] focus-visible:outline-[#943329] disabled:text-[#943329]/45',
} as const;

export function DashboardActionButton({
  children,
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: DashboardActionButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed motion-reduce:transition-none ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
