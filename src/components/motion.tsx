import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';

/**
 * The console's motion vocabulary (console-motion skill). Arrive and count-up
 * live here; both play once, and both show the finished state under reduced
 * motion.
 */

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Content fades in and rises a little, once, when it first appears. */
export function Arrive({
  children,
  index = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.48, ease: EASE, delay: reduce ? 0 : Math.min(index, 8) * 0.06 }}
    >
      {children}
    </Tag>
  );
}

/** A figure that counts up once, on first view. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const played = useRef(false);

  useEffect(() => {
    if (reduce || played.current) {
      setShown(value);
      return;
    }
    played.current = true;
    const controls = animate(0, value, {
      duration: 0.6,
      ease: EASE,
      onUpdate: v => setShown(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="visually-hidden">{format(value)}</span>
    </>
  );
}

export { EASE };
