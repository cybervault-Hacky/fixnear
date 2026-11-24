'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState, type PropsWithChildren } from 'react';

type ComingSoonButtonProps = PropsWithChildren<{
  message: string;
  variant?: 'primary' | 'secondary' | 'lime' | 'light';
  size?: 'small' | 'medium' | 'large';
  className?: string;
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

export function ComingSoonButton({
  children,
  message,
  variant = 'secondary',
  size = 'medium',
  className = '',
}: ComingSoonButtonProps) {
  const [noticeVisible, setNoticeVisible] = useState(false);
  const reducedMotion = useReducedMotion();
  const noticeId = `notice-${useId().replaceAll(':', '')}`;

  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <motion.button
        type="button"
        tabIndex={0}
        aria-expanded={noticeVisible}
        aria-controls={noticeVisible ? noticeId : undefined}
        onClick={() => setNoticeVisible((visible) => !visible)}
        whileHover={reducedMotion ? undefined : { y: -1 }}
        whileTap={reducedMotion ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-midnight/15 font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-midnight motion-reduce:transition-none ${variants[variant]} ${sizes[size]}`}
      >
        {children}
        <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] opacity-75">
          Soon
        </span>
      </motion.button>
      <AnimatePresence initial={false}>
        {noticeVisible && (
          <motion.p
            id={noticeId}
            role="status"
            initial={reducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            className="max-w-xs text-xs leading-5 text-midnight/70"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
