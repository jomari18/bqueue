import { MeshTransmissionMaterial, RoundedBox, useFBO } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

const SPAN = 4.6;
const HEIGHT = 3.4;
const DEPTH = 0.2;

/**
 * Spec 11.4: vertical reeded-glass slats in front of the ticket. They share one transmission buffer, rendered once
 * a frame with the slats hidden, instead of each slat rendering the scene again.
 */
export function Slats({ count, resolution, samples }: { count: number; resolution: number; samples: number }) {
  const group = useRef<Group>(null);
  const buffer = useFBO(resolution, resolution);
  const pitch = SPAN / count;

  useFrame(({ gl, scene, camera }) => {
    if (!group.current) return;
    group.current.visible = false;
    gl.setRenderTarget(buffer);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    group.current.visible = true;
  });

  return (
    <group ref={group} position={[0, 0, 0.55]}>
      {Array.from({ length: count }, (_, i) => (
        // Flat faces with rounded edges: the ticket reads through each slat's middle and ripples at the seams.
        <RoundedBox key={i} args={[pitch * 0.96, HEIGHT, DEPTH]} radius={Math.min(0.06, pitch * 0.2)} smoothness={4} position={[-SPAN / 2 + pitch * (i + 0.5), 0, 0]}>
          <MeshTransmissionMaterial
            buffer={buffer.texture}
            transmission={1}
            roughness={0.05}
            thickness={0.5}
            ior={1.5}
            chromaticAberration={0.04}
            anisotropy={0.1}
            distortion={0.1}
            distortionScale={0.2}
            temporalDistortion={0}
            resolution={resolution}
            samples={samples}
            backside={false}
          />
        </RoundedBox>
      ))}
    </group>
  );
}
