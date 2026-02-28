"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type PageTransitionProps = {
  children: ReactNode;
  variant?: "fade-slide-up" | "slide-from-right";
};

const variants = {
  "fade-slide-up": {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  "slide-from-right": {
    initial: { opacity: 0, x: 60 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 60 },
  },
};

// Module-level flag: skip animation on the very first render (SSR hydration)
// to avoid server/client inline style mismatch.
let hasHydrated = false;

export function PageTransition({
  children,
  variant = "fade-slide-up",
}: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isInitialMount] = useState(() => !hasHydrated);

  useEffect(() => {
    hasHydrated = true;
  }, []);

  const skipAnimation = isInitialMount || prefersReducedMotion;
  const motionVariant = variants[variant];

  return (
    <motion.div
      initial={skipAnimation ? false : motionVariant.initial}
      animate={motionVariant.animate}
      exit={skipAnimation ? undefined : motionVariant.exit}
      transition={{ duration: skipAnimation ? 0 : 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
