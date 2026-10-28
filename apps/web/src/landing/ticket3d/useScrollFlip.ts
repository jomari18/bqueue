import { type RefObject, useEffect, useRef } from "react";

/**
 * True once the page has scrolled 40% of the stage's height past its top (spec 11.4). A ref, read every frame,
 * so scrolling never re-renders the scene.
 */
export function useScrollFlip(stage: RefObject<Element | null>, threshold = 0.4): RefObject<boolean> {
  const flipped = useRef(false);
  useEffect(() => {
    const update = () => {
      const node = stage.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      flipped.current = rect.height > 0 && -rect.top / rect.height > threshold;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [stage, threshold]);
  return flipped;
}
