import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { vertexShader, fragmentShader } from '../shaders.ts';

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
  hiddenLabel?: number;
}

export function VolumeMesh({
  volume,
  mask,
  scale,
  windowMin,
  windowMax,
  maskOpacity,
  flip,
  hiddenLabel = -1,
}: VolumeMeshProps) {
  const matRef = useRef<THREE.RawShaderMaterial>(null);

  const { invalidate } = useThree();

  const uniforms = useMemo(
    () => ({
      u_volume: { value: volume },
      u_mask: { value: mask || fallbackMask },
      u_hasMask: { value: !!mask },
      u_maskOpacity: { value: maskOpacity },
      u_windowMin: { value: windowMin },
      u_windowMax: { value: windowMax },
      u_flip: { value: new THREE.Vector3() },
      u_hiddenLabel: { value: hiddenLabel },
    }),
    [volume, mask]
  );

  // Sync uniforms to material and trigger a re-render ONLY when React props change
  useEffect(() => {
    const u = matRef.current?.uniforms;
    if (!u) return;

    u.u_windowMin.value = windowMin;
    u.u_windowMax.value = windowMax;
    u.u_maskOpacity.value = maskOpacity;
    u.u_hasMask.value = !!mask;
    u.u_hiddenLabel.value = hiddenLabel;
    u.u_flip.value.set(Number(flip[0]), Number(flip[1]), Number(flip[2]));

    // Wake up the Canvas renderer
    invalidate();
  }, [windowMin, windowMax, maskOpacity, flip, mask, hiddenLabel, invalidate]);

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