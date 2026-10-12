import { type RefObject, useCallback } from "react";
import { flushSync } from "react-dom";

/**
 * Runs a theme change inside a circular View Transition that grows from the
 * element in `originRef`. Falls back to an instant switch where the API (or
 * motion) is unavailable.
 */
export function useThemeTransition(originRef: RefObject<HTMLElement | null>) {
  return useCallback(
    (apply: () => void) => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!document.startViewTransition || reduced) {
        apply();
        return;
      }
      const rect = originRef.current?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const y = rect ? rect.top + rect.height / 2 : 0;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      const transition = document.startViewTransition(() => flushSync(apply));
      transition.ready
        .then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 450, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
          );
        })
        .catch(() => undefined);
    },
    [originRef]
  );
}
