import { useCallback, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VolumeMesh } from './VolumeMesh';
import { parseVolume, parseMask } from './loaders';
import { API_BASE, PRESETS, type Status, type VolumeData } from './config';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [volume, setVolume] = useState<VolumeData | null>(null);
  const [mask, setMask] = useState<THREE.Data3DTexture | null>(null);
  const [scanIdInput, setScanIdInput] = useState('');

  const [windowMin, setWindowMin] = useState(PRESETS.softTissue.min);
  const [windowMax, setWindowMax] = useState(PRESETS.softTissue.max);
  const [maskOpacity, setMaskOpacity] = useState(0.5);
  const [flip, setFlip] = useState<[boolean, boolean, boolean]>([false, false, false]);

  const resetViewer = () => {
    volume?.texture.dispose();
    mask?.dispose();
    setVolume(null);
    setMask(null);
    setErrorMessage('');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetViewer();
    setStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`${API_BASE}/api/upload-dicom`, { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('DICOM upload failed');

      const { scan_id: scanId } = await uploadRes.json();
      setScanIdInput(scanId);

      const loadedVolume = await parseVolume(`${API_BASE}/data/nifti/${scanId}.nii.gz`);
      setVolume(loadedVolume);

      setStatus('segmenting');
      const segRes = await fetch(`${API_BASE}/api/segment/${scanId}`, { method: 'POST' });
      if (!segRes.ok) throw new Error('Segmentation failed');

      const loadedMask = await parseMask(`${API_BASE}/data/masks/${scanId}_mask.nii.gz?t=${Date.now()}`);
      setMask(loadedMask);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleLoadSaved = async () => {
    const scanId = scanIdInput.trim();
    if (!scanId) return;

    resetViewer();
    setStatus('loading');

    try {
      const loadedVolume = await parseVolume(`${API_BASE}/data/nifti/${scanId}.nii.gz`);
      setVolume(loadedVolume);

      try {
        const loadedMask = await parseMask(`${API_BASE}/data/masks/${scanId}_mask.nii.gz`);
        setMask(loadedMask);
      } catch (maskErr) {
        console.warn('No mask found for this scan or failed to load', maskErr);
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load saved files');
    }
  };

  const toggleFlip = useCallback((axis: 0 | 1 | 2) => {
    setFlip((prev) => {
      const next = [...prev];
      next[axis] = !next[axis];
      return next as [boolean, boolean, boolean];
    });
  }, []);

  const isBusy = status === 'uploading' || status === 'loading' || status === 'segmenting';

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', position: 'relative' }}>
      <aside
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10, width: 280, padding: 16,
          borderRadius: 8, background: 'rgba(20, 20, 20, 0.85)', backdropFilter: 'blur(8px)',
          color: '#e5e5e5', fontFamily: 'system-ui, sans-serif', fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>DICOM Viewer</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Enter saved Scan ID"
            value={scanIdInput}
            onChange={(e) => setScanIdInput(e.target.value)}
            disabled={isBusy}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #444', background: '#222', color: '#fff' }}
          />
          <button
            onClick={handleLoadSaved}
            disabled={isBusy || !scanIdInput.trim()}
            style={{ padding: '4px 12px', borderRadius: 4, cursor: 'pointer', border: 'none', background: '#38bdf8', color: '#000', fontWeight: 600 }}
          >
            Load
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#444' }} />
          <span style={{ margin: '0 8px', color: '#888', fontSize: 11 }}>OR UPLOAD</span>
          <div style={{ flex: 1, height: 1, background: '#444' }} />
        </div>

        <input type="file" accept=".zip" onChange={handleUpload} disabled={isBusy} style={{ width: '100%', marginBottom: 12 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <label>
            Window Min: {windowMin} HU
            <input type="range" min="-1024" max="1500" value={windowMin} onChange={(e) => setWindowMin(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <label>
            Window Max: {windowMax} HU
            <input type="range" min="-1000" max="3000" value={windowMax} onChange={(e) => setWindowMax(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <label>
            Mask Opacity: {Math.round(maskOpacity * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={maskOpacity} onChange={(e) => setMaskOpacity(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
          {Object.entries(PRESETS).map(([name, { min, max }]) => (
            <button
              key={name} type="button" onClick={() => { setWindowMin(min); setWindowMax(max); }}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: 'none', background: '#333', color: '#fff' }}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={flip[i]} onChange={() => toggleFlip(i as 0 | 1 | 2)} /> {axis}
            </label>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: 10, color: '#888' }}>
          {status === 'idle' && 'No scan loaded'}
          {status === 'uploading' && <span style={{ color: '#38bdf8' }}>Uploading DICOM series…</span>}
          {status === 'loading' && <span style={{ color: '#38bdf8' }}>Loading saved volume…</span>}
          {status === 'segmenting' && <span style={{ color: '#facc15' }}>Running segmentation…</span>}
          {status === 'success' && <span style={{ color: '#4ade80' }}>Success</span>}
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