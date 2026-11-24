'use client';

import { Check, ClipboardList, House, ShieldCheck, Wrench } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export function HeroVisual() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.aside
      aria-labelledby="hero-visual-title"
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.65,
        delay: reducedMotion ? 0 : 0.12,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="relative mx-auto w-full max-w-[560px]"
    >
      <h2 id="hero-visual-title" className="sr-only">
        Illustrative FixNear service estimate preview
      </h2>
      <div className="hero-artboard relative min-h-[410px] overflow-hidden rounded-[2rem] bg-midnight p-5 sm:min-h-[470px] sm:p-7">
        <div aria-hidden="true" className="hero-artboard-grid" />
        <div aria-hidden="true" className="hero-artboard-glow" />

        <div className="relative z-10 flex items-center justify-between gap-3 text-white/75">
          <div className="inline-flex items-center gap-2 text-xs font-medium sm:text-sm">
            <span className="grid size-8 place-items-center rounded-lg bg-lime text-midnight">
              <House aria-hidden="true" size={17} />
            </span>
            FixNear service preview
          </div>
          <span className="rounded-full border border-white/20 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.13em] text-white/65 sm:text-[0.65rem]">
            Illustrative
          </span>
        </div>

        <motion.article
          animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 7, repeat: Infinity, ease: 'easeInOut', repeatType: 'loop' }
          }
          className="relative z-10 mx-auto mt-8 w-full max-w-[420px] rounded-2xl bg-white p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)] sm:mt-10 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
                <Wrench aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-midnight/50">
                  Example service plan
                </p>
                <p className="mt-1 text-sm font-semibold text-midnight sm:text-base">
                  Split AC · low cooling
                </p>
              </div>
            </div>
            <span className="mt-0.5 rounded-full bg-[#f1f5ed] px-2 py-1 text-[0.62rem] font-semibold text-midnight/70">
              For review
            </span>
          </div>

          <div className="my-5 h-px bg-midnight/10" />

          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-midnight/70">Inspection notes</span>
              <span className="font-medium text-midnight">Included</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-midnight/70">Parts, if needed</span>
              <span className="font-medium text-midnight">Listed separately</span>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#eef7e5] p-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
              <Check aria-hidden="true" size={16} strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-sm font-semibold text-midnight">You decide before scope changes</p>
              <p className="mt-1 text-xs leading-5 text-midnight/70">
                Extra work is shown for your approval first.
              </p>
            </div>
          </div>
        </motion.article>

        <div className="relative z-20 mx-auto mt-4 flex w-full max-w-[420px] items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3.5 text-white sm:absolute sm:bottom-6 sm:right-6 sm:mt-0 sm:w-auto sm:min-w-[250px]">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
            <ClipboardList aria-hidden="true" size={18} />
          </span>
          <div>
            <p className="text-xs font-semibold">Service notes, kept together</p>
            <p className="mt-0.5 text-[0.68rem] text-white/65">HomePassport concept preview</p>
          </div>
          <ShieldCheck aria-hidden="true" size={17} className="ml-auto shrink-0 text-lime" />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-midnight/55">
        Illustrative interface only · no live service data
      </p>
    </motion.aside>
  );
}
