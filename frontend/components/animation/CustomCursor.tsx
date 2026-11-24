'use client';

import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 240, damping: 28, mass: 0.55 });
  const ringY = useSpring(y, { stiffness: 240, damping: 28, mass: 0.55 });
  const ringScale = useSpring(1, { stiffness: 360, damping: 25, mass: 0.4 });
  const ringOpacity = useSpring(0, { stiffness: 280, damping: 30 });
  const dotOpacity = useSpring(0, { stiffness: 280, damping: 30 });

  useEffect(() => {
    const pointerQuery = window.matchMedia('(pointer: fine)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateAvailability = () => setEnabled(pointerQuery.matches && !motionQuery.matches);

    updateAvailability();
    pointerQuery.addEventListener('change', updateAvailability);
    motionQuery.addEventListener('change', updateAvailability);

    return () => {
      pointerQuery.removeEventListener('change', updateAvailability);
      motionQuery.removeEventListener('change', updateAvailability);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let overInteractiveElement = false;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      x.set(event.clientX);
      y.set(event.clientY);
      ringOpacity.set(1);
      dotOpacity.set(1);
    };
    const handlePointerOver = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      overInteractiveElement = Boolean(
        event.target.closest('a, button, input, textarea, select, [role="button"]'),
      );
      ringScale.set(overInteractiveElement ? 1.35 : 1);
    };
    const handlePointerDown = () => ringScale.set(0.82);
    const handlePointerUp = () => ringScale.set(overInteractiveElement ? 1.35 : 1);
    const handlePointerLeave = () => {
      ringOpacity.set(0);
      dotOpacity.set(0);
      overInteractiveElement = false;
      ringScale.set(1);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('blur', handlePointerLeave);
    document.addEventListener('pointerover', handlePointerOver, true);
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('blur', handlePointerLeave);
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [enabled, x, y, ringScale, ringOpacity, dotOpacity]);

  if (!enabled) return null;

  return (
    <>
      <motion.span
        aria-hidden="true"
        className="custom-cursor-ring"
        style={{ x: ringX, y: ringY, scale: ringScale, opacity: ringOpacity }}
      />
      <motion.span
        aria-hidden="true"
        className="custom-cursor-dot"
        style={{ x, y, opacity: dotOpacity }}
      />
    </>
  );
}
