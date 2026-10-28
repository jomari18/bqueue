"use client";

import { ContactShadows, Environment, Float, Lightformer } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { STILL_ALT } from "../TicketStage";
import { createSpin, dragBy, release } from "./dragSpin";
import { qualityFor } from "./quality";
import { TicketCard } from "./TicketCard";
import { useScrollFlip } from "./useScrollFlip";

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** No frames while the tab is hidden or the stage is scrolled out of view (spec 11.4). */
function useScenePaused(stage: RefObject<Element | null>): boolean {
  const hidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden, () => false);
  const [outOfView, setOutOfView] = useState(false);
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOutOfView(entry ? !entry.isIntersecting : false));
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage]);
  return hidden || outOfView;
}

/** The landing's floating B.Queue ticket on a mint backdrop. TicketStage loads this chunk only where it plays. */
export function TicketScene() {
  const stage = useRef<HTMLDivElement>(null);
  const paused = useScenePaused(stage);
  const flipped = useScrollFlip(stage);
  const pointer = useRef({ x: 0, y: 0 });
  const spin = useRef(createSpin());
  const last = useRef<{ x: number; y: number; touch: boolean } | null>(null);
  const [quality] = useState(() => qualityFor(window.innerWidth));

  useEffect(() => {
    const follow = (event: PointerEvent) => {
      // A finger moving is the page scrolling; only a mouse tilts the ticket.
      if (event.pointerType !== "mouse") return;
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = 1 - (event.clientY / window.innerHeight) * 2;
    };
    window.addEventListener("pointermove", follow, { passive: true });
    return () => window.removeEventListener("pointermove", follow);
  }, []);

  return (
    <div
      ref={stage}
      role="img"
      aria-label={STILL_ALT}
      // Hold the mouse button (or drag a finger sideways) to spin the ticket; vertical swipes still scroll the page.
      className="size-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" };
      }}
      onPointerMove={(e) => {
        const from = last.current;
        if (!from) return;
        dragBy(spin.current, e.clientX - from.x, from.touch ? 0 : e.clientY - from.y);
        last.current = { ...from, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        last.current = null;
        release(spin.current);
      }}
      onPointerCancel={() => {
        last.current = null;
        release(spin.current);
      }}
    >
      <Canvas
        // No tone mapping: the mint and the forest green stay the token colours instead of washing to grey.
        flat
        dpr={quality.dpr}
        frameloop={paused ? "never" : "always"}
        camera={{ position: [0, 0, 4.4], fov: 35 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        <color attach="background" args={["#E2F1E8"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <pointLight position={[0, 0, -1.6]} color="#C6F432" intensity={6} distance={6} />
        <Environment resolution={64} frames={1}>
          <Lightformer intensity={2} position={[0, 3, 4]} scale={[8, 2, 1]} />
          <Lightformer intensity={1} color="#C6F432" position={[-4, 0, 2]} scale={[2, 6, 1]} />
        </Environment>
        <group position={[0, 0.05, 0]}>
          <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.4}>
            <TicketCard pointer={pointer} flipped={flipped} spin={spin} />
          </Float>
        </group>
        <ContactShadows position={[0, -1.15, 0]} opacity={0.35} blur={2.6} scale={9} far={3} color="#0F4029" />
      </Canvas>
    </div>
  );
}
