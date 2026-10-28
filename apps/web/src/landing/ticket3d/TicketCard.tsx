import { RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import { type Group, MathUtils } from "three";

const FONT = "/fonts/ticket.woff";
const TILT = 0.18;

/**
 * The forest-green ticket with a lime rim: D-012 on the front, D-013 on the back. The pointer tilts it (damped) and
 * `flipped` turns it 180° on a spring, so scrolling past the hero calls the next number (spec 11.4).
 */
export function TicketCard({ pointer, flipped }: { pointer: RefObject<{ x: number; y: number }>; flipped: RefObject<boolean> }) {
  const tilt = useRef<Group>(null);
  const flip = useRef<Group>(null);
  const spring = useRef({ angle: 0, velocity: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    if (tilt.current) {
      tilt.current.rotation.y = MathUtils.damp(tilt.current.rotation.y, pointer.current.x * TILT, 4, dt);
      tilt.current.rotation.x = MathUtils.damp(tilt.current.rotation.x, -pointer.current.y * TILT, 4, dt);
    }
    const s = spring.current;
    const target = flipped.current ? Math.PI : 0;
    // A slightly underdamped spring: a short overshoot, then rest.
    s.velocity += ((target - s.angle) * 60 - s.velocity * 11) * dt;
    s.angle += s.velocity * dt;
    if (flip.current) flip.current.rotation.y = s.angle;
  });

  return (
    <group ref={tilt}>
      <group ref={flip}>
        <RoundedBox args={[2.72, 1.42, 0.1]} radius={0.14} smoothness={4} position={[0, 0, 0]}>
          <meshStandardMaterial color="#C6F432" emissive="#C6F432" emissiveIntensity={0.35} roughness={0.4} />
        </RoundedBox>
        <RoundedBox args={[2.6, 1.3, 0.12]} radius={0.1} smoothness={4}>
          <meshStandardMaterial color="#1F7A4D" roughness={0.35} metalness={0.05} />
        </RoundedBox>
        <Face code="D-012" z={0.065} />
        <Face code="D-013" z={-0.065} back />
      </group>
    </group>
  );
}

function Face({ code, z, back = false }: { code: string; z: number; back?: boolean }) {
  return (
    <group position={[0, 0, z]} rotation={[0, back ? Math.PI : 0, 0]}>
      <Text font={FONT} fontSize={0.13} letterSpacing={0.2} color="#E2F1E8" anchorX="center" anchorY="middle" position={[0, 0.38, 0]}>
        NOW SERVING
      </Text>
      <Text font={FONT} fontSize={0.62} color="#FFFFFF" anchorX="center" anchorY="middle" position={[0, -0.08, 0]}>
        {code}
      </Text>
    </group>
  );
}
