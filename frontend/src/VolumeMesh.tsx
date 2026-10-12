import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { vertexShader, fragmentShader } from './shaders';

const fallbackMask = new THREE.Data3DTexture(new Uint8Array([0]), 1, 1, 1);
fallbackMask.format = THREE.RedFormat;
fallbackMask.type = THREE.UnsignedByteType;
fallbackMask.needsUpdate = true;

interface VolumeMeshProps {
  volume: THREE.Data3DTexture;
  mask?: THREE.Data3DTexture | null;
  scale: [number, number, number];
  windowMin: number;
  windowMax: number;
  maskOpacity: number;
  flip: [boolean, boolean, boolean];
}

export function VolumeMesh({
  volume,
  mask,
  scale,
  windowMin,
  windowMax,
  maskOpacity,
  flip,
}: VolumeMeshProps) {
  const matRef = useRef<THREE.RawShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      u_volume: { value: volume },
      u_mask: { value: mask || fallbackMask },
      u_maskOpacity: { value: maskOpacity },
      u_windowMin: { value: windowMin },
      u_windowMax: { value: windowMax },
      u_flip: { value: new THREE.Vector3() },
    }),
    [volume, mask]
  );

  useFrame(() => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.u_windowMin.value = windowMin;
    u.u_windowMax.value = windowMax;
    u.u_maskOpacity.value = maskOpacity;
    u.u_flip.value.set(Number(flip[0]), Number(flip[1]), Number(flip[2]));
  });

  return (
    <mesh scale={scale} rotation={[-Math.PI / 2, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <rawShaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        glslVersion={THREE.GLSL3}
        transparent
        side={THREE.BackSide}
        uniforms={uniforms}
      />
    </mesh>
  );
}