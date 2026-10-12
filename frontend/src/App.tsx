import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import * as nifti from 'nifti-reader-js';

const API_BASE = 'http://localhost:8003';

const PRESETS = {
  lung: { min: -1000, max: -400 },
  softTissue: { min: -100, max: 300 },
  bone: { min: 200, max: 1500 },
} as const;

type Status = 'idle' | 'uploading' | 'segmenting' | 'ready' | 'error';

interface VolumeData {
  texture: THREE.Data3DTexture;
  scale: [number, number, number];
}

const vertexShader = /* glsl */ `
  in vec3 position;
  uniform mat4 modelMatrix;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec3 cameraPosition;

  out vec3 vOrigin;
  out vec3 vDirection;

  void main() {
    vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  in vec3 vOrigin;
  in vec3 vDirection;

  uniform sampler3D u_volume;
  uniform sampler3D u_mask;
  uniform float u_maskOpacity;
  uniform float u_windowMin;
  uniform float u_windowMax;
  uniform vec3 u_flip;

  out vec4 fragColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 labelColor(float id) {
    return fract(sin(vec3(id * 12.9898, id * 78.233, id * 39.346)) * 43758.5453);
  }

  vec2 intersectBox(vec3 orig, vec3 dir) {
    vec3 invDir = 1.0 / dir;
    vec3 t0 = (-0.5 - orig) * invDir;
    vec3 t1 = (0.5 - orig) * invDir;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);
    return vec2(max(tMin.x, max(tMin.y, tMin.z)), min(tMax.x, min(tMax.y, tMax.z)));
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 bounds = intersectBox(vOrigin, rayDir);
    if (bounds.x > bounds.y) discard;

    bounds.x = max(bounds.x, 0.0);
    vec3 p = vOrigin + bounds.x * rayDir;
    
    vec3 inc = 1.0 / abs(rayDir);
    float stepSize = min(inc.x, min(inc.y, min(inc.z, 1.0))) / 250.0;
    vec3 stepVec = rayDir * stepSize;

    p += stepVec * hash(gl_FragCoord.xy);

    float range = max(u_windowMax - u_windowMin, 1.0);
    vec4 acc = vec4(0.0);

    for (int i = 0; i < 500; i++) {
      vec3 uvw = p + 0.5;
      uvw = mix(uvw, 1.0 - uvw, u_flip);

      float density = texture(u_volume, uvw).r;
      float v = clamp((density - u_windowMin) / range, 0.0, 1.0);
      float maskVal = texture(u_mask, uvw).r;

      float a = v * v * 0.15;
      vec3 c = vec3(v);

      if (maskVal > 0.0) {
        float organId = floor(maskVal * 255.0 + 0.5);
        c = mix(c, labelColor(organId), u_maskOpacity);
        a = max(a, u_maskOpacity * 0.05);
      }

      acc.rgb += (1.0 - acc.a) * a * c;
      acc.a   += (1.0 - acc.a) * a;

      if (acc.a > 0.95) break;

      p += stepVec;
      if (any(greaterThan(p, vec3(0.5))) || any(lessThan(p, vec3(-0.5)))) break;
    }

    fragColor = vec4(acc.rgb / max(acc.a, 0.001), acc.a);
  }
`;

const fallbackMask = new THREE.Data3DTexture(new Uint8Array([0]), 1, 1, 1);
fallbackMask.format = THREE.RedFormat;
fallbackMask.type = THREE.UnsignedByteType;
fallbackMask.needsUpdate = true;

async function parseVolume(url: string): Promise<VolumeData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching scan`);

  let buf = await res.arrayBuffer();
  if (nifti.isCompressed(buf)) buf = nifti.decompress(buf) as ArrayBuffer;

  const header = nifti.readHeader(buf);
  if (!header) throw new Error('Invalid NIfTI header');

  const raw = nifti.readImage(header, buf);
  const dims = header.dims.slice(1, 4);
  const total = dims[0] * dims[1] * dims[2];

  const slope = header.scl_slope || 1;
  const intercept = header.scl_inter || 0;

  const ctorMap: Record<number, any> = {
    [nifti.NIFTI1.TYPE_UINT8]: Uint8Array,
    [nifti.NIFTI1.TYPE_INT8]: Int8Array,
    [nifti.NIFTI1.TYPE_INT16]: Int16Array,
    [nifti.NIFTI1.TYPE_UINT16]: Uint16Array,
    [nifti.NIFTI1.TYPE_INT32]: Int32Array,
    [nifti.NIFTI1.TYPE_FLOAT32]: Float32Array,
    [nifti.NIFTI1.TYPE_FLOAT64]: Float64Array,
  };

  const Ctor = ctorMap[header.datatypeCode];
  if (!Ctor) throw new Error(`Unsupported datatype: ${header.datatypeCode}`);

  const src = new Ctor(raw);
  const half = new Uint16Array(total);

  for (let i = 0; i < total; i++) {
    half[i] = THREE.DataUtils.toHalfFloat(src[i] * slope + intercept);
  }

  const texture = new THREE.Data3DTexture(half, dims[0], dims[1], dims[2]);
  texture.format = THREE.RedFormat;
  texture.type = THREE.HalfFloatType;
  texture.internalFormat = 'R16F';
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const sx = dims[0] * (header.pixDims[1] || 1);
  const sy = dims[1] * (header.pixDims[2] || 1);
  const sz = dims[2] * (header.pixDims[3] || 1);
  const maxDim = Math.max(sx, sy, sz);

  return { texture, scale: [sx / maxDim, sy / maxDim, sz / maxDim] };
}

async function parseMask(url: string): Promise<THREE.Data3DTexture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching mask`);

  let buf = await res.arrayBuffer();
  if (nifti.isCompressed(buf)) buf = nifti.decompress(buf) as ArrayBuffer;

  const header = nifti.readHeader(buf);
  if (!header) throw new Error('Invalid NIfTI header');

  const raw = nifti.readImage(header, buf);
  const dims = header.dims.slice(1, 4);

  const texture = new THREE.Data3DTexture(new Uint8Array(raw), dims[0], dims[1], dims[2]);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.internalFormat = 'R8';
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return texture;
}

function VolumeMesh({
  volume,
  mask,
  scale,
  windowMin,
  windowMax,
  maskOpacity,
  flip,
}: {
  volume: THREE.Data3DTexture;
  mask?: THREE.Data3DTexture | null;
  scale: [number, number, number];
  windowMin: number;
  windowMax: number;
  maskOpacity: number;
  flip: [boolean, boolean, boolean];
}) {
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

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [volume, setVolume] = useState<VolumeData | null>(null);
  const [mask, setMask] = useState<THREE.Data3DTexture | null>(null);

  const [windowMin, setWindowMin] = useState(PRESETS.softTissue.min);
  const [windowMax, setWindowMax] = useState(PRESETS.softTissue.max);
  const [maskOpacity, setMaskOpacity] = useState(0.5);
  const [flip, setFlip] = useState<[boolean, boolean, boolean]>([false, false, false]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    volume?.texture.dispose();
    mask?.dispose();
    setVolume(null);
    setMask(null);
    setStatus('uploading');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`${API_BASE}/api/upload-dicom`, { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('DICOM upload failed');
      const { scan_id: scanId } = await uploadRes.json();

      const loadedVolume = await parseVolume(`${API_BASE}/data/nifti/${scanId}.nii.gz`);
      setVolume(loadedVolume);

      setStatus('segmenting');
      const segRes = await fetch(`${API_BASE}/api/segment/${scanId}`, { method: 'POST' });
      if (!segRes.ok) throw new Error('Segmentation failed');

      const loadedMask = await parseMask(`${API_BASE}/data/masks/${scanId}_mask.nii.gz?t=${Date.now()}`);
      setMask(loadedMask);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const toggleFlip = useCallback((axis: 0 | 1 | 2) => {
    setFlip((prev) => {
      const next = [...prev] as [boolean, boolean, boolean];
      next[axis] = !next[axis];
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', position: 'relative' }}>
      <aside
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          width: 280,
          padding: 16,
          borderRadius: 8,
          background: 'rgba(20, 20, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          color: '#e5e5e5',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>DICOM Viewer</div>

        <input
          type="file"
          accept=".zip"
          onChange={handleUpload}
          disabled={status === 'uploading' || status === 'segmenting'}
          style={{ width: '100%', marginBottom: 12 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <label>
            Window Min: {windowMin} HU
            <input
              type="range"
              min="-1024"
              max="1500"
              value={windowMin}
              onChange={(e) => setWindowMin(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>

          <label>
            Window Max: {windowMax} HU
            <input
              type="range"
              min="-1000"
              max="3000"
              value={windowMax}
              onChange={(e) => setWindowMax(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>

          <label>
            Mask Opacity: {Math.round(maskOpacity * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={maskOpacity}
              onChange={(e) => setMaskOpacity(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
          {Object.entries(PRESETS).map(([name, { min, max }]) => (
            <button
              key={name}
              type="button"
              onClick={() => { setWindowMin(min); setWindowMax(max); }}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11, cursor: 'pointer' }}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={flip[i]} onChange={() => toggleFlip(i as 0 | 1 | 2)} />
              {axis}
            </label>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: 10, color: '#888' }}>
          {status === 'idle' && 'No scan loaded'}
          {status === 'uploading' && <span style={{ color: '#38bdf8' }}>Uploading DICOM series…</span>}
          {status === 'segmenting' && <span style={{ color: '#facc15' }}>Running segmentation…</span>}
          {status === 'ready' && <span style={{ color: '#4ade80' }}>Ready</span>}
          {status === 'error' && <span style={{ color: '#f87171' }}>{errorMessage}</span>}
        </div>
      </aside>

      <Canvas camera={{ position: [0, 0, 1.5] }}>
        <OrbitControls makeDefault />
        {volume ? (
          <VolumeMesh
            volume={volume.texture}
            mask={mask}
            scale={volume.scale}
            windowMin={windowMin}
            windowMax={windowMax}
            maskOpacity={maskOpacity}
            flip={flip}
          />
        ) : (
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#1a1a1a" wireframe />
          </mesh>
        )}
      </Canvas>
    </div>
  );
}