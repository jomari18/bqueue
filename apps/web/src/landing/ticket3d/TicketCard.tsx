import { RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import { type Group, MathUtils } from "three";
import { type Spin, stepSpin } from "./dragSpin";

const FONT = "/fonts/ticket.woff";
const TILT = 0.18;

/**
 * The forest-green ticket with a lime rim and the brand on both faces. The pointer tilts it (damped), a held mouse
 * button or finger spins it (`spin`, settling back facing front), and `flipped` turns it 180° on a spring when the
 * page scrolls past the hero.
 */
export function TicketCard({
  pointer,
  flipped,
  spin,
}: {
  pointer: RefObject<{ x: number; y: number }>;
  flipped: RefObject<boolean>;
  spin: RefObject<Spin>;
}) {
  const tilt = useRef<Group>(null);
  const turn = useRef<Group>(null);
  const flip = useRef<Group>(null);
  const spring = useRef({ angle: 0, velocity: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // While dragging, the drag owns the rotation and the hover tilt rests.
    const held = spin.current.dragging;
    if (tilt.current) {
      tilt.current.rotation.y = MathUtils.damp(tilt.current.rotation.y, held ? 0 : pointer.current.x * TILT, 4, dt);
      tilt.current.rotation.x = MathUtils.damp(tilt.current.rotation.x, held ? 0 : -pointer.current.y * TILT, 4, dt);
    }
    stepSpin(spin.current, dt);
    turn.current?.rotation.set(spin.current.x, spin.current.y, 0);
    const s = spring.current;
    const target = flipped.current ? Math.PI : 0;
    // A slightly underdamped spring: a short overshoot, then rest.
    s.velocity += ((target - s.angle) * 60 - s.velocity * 11) * dt;
    s.angle += s.velocity * dt;
    if (flip.current) flip.current.rotation.y = s.angle;
  });

  return (
    <group ref={tilt}>
      <group ref={turn}>
        <group ref={flip}>
          <RoundedBox args={[2.72, 1.42, 0.1]} radius={0.14} smoothness={4} position={[0, 0, 0]}>
            <meshStandardMaterial color="#C6F432" emissive="#C6F432" emissiveIntensity={0.35} roughness={0.4} />
          </RoundedBox>
          <RoundedBox args={[2.6, 1.3, 0.12]} radius={0.1} smoothness={4}>
            <meshStandardMaterial color="#1F7A4D" roughness={0.35} metalness={0.05} />
          </RoundedBox>
          <Face z={0.065} />
          <Face z={-0.065} back />
        </group>
      </group>
    </group>
  );
}

function Face({ z, back = false }: { z: number; back?: boolean }) {
  return (
    <group position={[0, 0, z]} rotation={[0, back ? Math.PI : 0, 0]}>
      <Text font={FONT} fontSize={0.5} maxWidth={2.3} color="#FFFFFF" anchorX="center" anchorY="middle">
        B.Queue
      </Text>
    </group>
  );
}
