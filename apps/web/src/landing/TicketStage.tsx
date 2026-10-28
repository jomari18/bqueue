"use client";

import { Component, lazy, type ReactNode, Suspense, useEffect, useState, useSyncExternalStore } from "react";

const STILL_SRC = "/ticket-still.webp";
export const STILL_ALT = "A green B.Queue ticket";
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

// three.js is most of the landing's weight, so the scene is its own chunk, fetched only when it will play.
const TicketScene = lazy(() => import("./ticket3d/TicketScene").then((m) => ({ default: m.TicketScene })));

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCE_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia?.(REDUCE_MOTION).matches ?? false;

const SIGNS_OF_LIFE = ["pointermove", "keydown", "scroll", "touchstart"] as const;

/** True from the visitor's first move: starting three.js costs a phone seconds, so the page is usable first. */
function useVisitorEngaged(): boolean {
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    if (engaged) return;
    const engage = () => setEngaged(true);
    for (const event of SIGNS_OF_LIFE) window.addEventListener(event, engage, { passive: true, once: true });
    return () => {
      for (const event of SIGNS_OF_LIFE) window.removeEventListener(event, engage);
    };
  }, [engaged]);
  return engaged;
}

/** WebGL that can start on this device; the probe's context is let go at once. */
function webglWorks(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl != null;
  } catch {
    return false;
  }
}

/** A scene that cannot start (its chunk failed, the GPU refused) leaves the still in its place. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The floating B.Queue ticket, or its still picture under reduced motion or without WebGL. The still shows
 * until the visitor moves and the chunk arrives, and stays behind the canvas until it draws.
 */
export function TicketStage() {
  const reduceMotion = useSyncExternalStore(subscribeToMotion, prefersReducedMotion, () => true);
  const [webgl] = useState(() => typeof document !== "undefined" && webglWorks());
  const engaged = useVisitorEngaged();
  // eslint-disable-next-line @next/next/no-img-element -- a fixed local picture sized by its stage
  const still = <img src={STILL_SRC} alt={STILL_ALT} width={1200} height={900} className="size-full object-cover" />;
  return (
    <div className="size-full overflow-hidden rounded-card bg-accent-tint bg-cover bg-center" style={{ backgroundImage: `url(${STILL_SRC})` }}>
      {reduceMotion || !webgl || !engaged ? (
        still
      ) : (
        <div data-testid="ticket-canvas" className="size-full">
          <SceneBoundary fallback={still}>
            <Suspense fallback={still}>
              <TicketScene />
            </Suspense>
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
